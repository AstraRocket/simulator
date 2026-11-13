// RASP `.eng` header: designation diameter(mm) length(mm) delays propWeight(kg) totalWeight(kg) manufacturer.
// As upstream's RASPMotorLoader, one bad motor refuses the whole file.
import { customMotorId, motorHeaderProblem, type CustomMotor } from './motorStore';
import { impulseClass } from './motorCombine';
import { totalImpulse } from './motorMath';
import { removeDelay } from './rseParser';
import { MAX_CURVE_SAMPLES, MAX_THRUST_N, finalizeCurve } from './curveFinalize';
import { delayList } from './motorPicker';
import { KeyedError } from '../../i18n/keyedError';
import { readDecimal } from '../files/numberText';

interface Line {
  text: string;
  /** 1-based. */
  no: number;
}

export function parseEng(text: string): CustomMotor[] {
  const lines: Line[] = text
    // CR alone too, as `BufferedReader.readLine`.
    .split(/\r\n|[\r\n]/)
    .map((l, i) => ({ text: l.trim(), no: i + 1 }))
    .filter((l) => l.text && !l.text.startsWith(';'));
  if (lines.length < 2) throw new KeyedError('errors.motorFile.engNoData');

  const motors: CustomMotor[] = [];
  let i = 0;
  while (i < lines.length) {
    const { motor, next } = parseMotor(lines, i);
    motors.push(motor);
    i = next;
  }
  return motors;
}

function parseMotor(lines: readonly Line[], at: number): { motor: CustomMotor; next: number } {
  const header = lines[at]!.text.split(/\s+/);
  if (header.length < 7) {
    throw new KeyedError('errors.motorFile.engHeader');
  }
  const [rawDesignation = '', diaS = '', lenS = '', delaysS, propS = '', totalS = '', ...mfr] = header;
  // `C6-5` is the C6; kept on, it would seat as `C6-5-5`.
  const designation = removeDelay(rawDesignation);
  const diameter = readDecimal(diaS);
  const length = readDecimal(lenS);
  const propKg = readDecimal(propS);
  const totalKg = readDecimal(totalS);
  // Checked as stored grams: 1e306 kg is finite but its grams are not.
  const problem = motorHeaderProblem({ diameter, length, totalWeightG: totalKg * 1000, propWeightG: propKg * 1000 });
  if (problem === 'numbers') throw new KeyedError('errors.motorFile.engHeaderNumbers');
  if (problem === 'size') throw new KeyedError('errors.motorFile.engHeaderSize');
  if (problem) throw new KeyedError('errors.motorFile.engHeaderMass');

  // `customToRow` reads only `delayList`, so the delays must go through it here.
  const delays = delayList(delaysS, 'rasp');

  // Any non-data line refuses the file, as upstream; only a 7-field header ends the block.
  const raw: { time: number; thrust: number }[] = [];
  let i = at + 1;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const fields = line.text.split(/\s+/);
    if (fields.length >= 7) break;
    const [t, f] = fields.map(readDecimal);
    if (fields.length !== 2 || t === undefined || f === undefined || !Number.isFinite(t) || !Number.isFinite(f)) {
      throw new KeyedError('errors.motorFile.engDataLine', { line: line.no, text: line.text });
    }
    if (f < 0) throw new KeyedError('errors.motorFile.engNegativeThrust', { motor: designation, line: line.no });
    if (f > MAX_THRUST_N)
      throw new KeyedError('errors.motorFile.engThrustTooHigh', { motor: designation, line: line.no });
    if (t < 0) throw new KeyedError('errors.motorFile.engNegativeTime', { motor: designation, line: line.no });
    if (raw.length >= MAX_CURVE_SAMPLES) {
      throw new KeyedError('errors.motorFile.engTooManyPoints', { motor: designation, max: MAX_CURVE_SAMPLES });
    }
    raw.push({ time: t, thrust: f });
  }
  // Finalized first, as desktop, so impulse, class and burn time count the added ramp from zero.
  const samples = finalizeCurve(raw);
  if (samples.length < 2) throw new KeyedError('errors.motorFile.engNoCurve');
  if (!samples.some((s) => s.thrust > 0)) {
    throw new KeyedError('errors.motorFile.engNoThrust', { motor: designation });
  }

  const manufacturer = mfr.join(' ') || 'Custom';
  return {
    motor: {
      id: customMotorId(manufacturer, designation),
      designation,
      manufacturer,
      class: impulseClass(totalImpulse(samples)),
      diameter,
      length,
      totalWeightG: totalKg * 1000,
      propWeightG: propKg * 1000,
      delayList: delays,
      samples,
      source: 'eng',
    },
    next: i,
  };
}
