import { token } from '../common/colorTokens';

export function SchematicDefs({ clipDefs }: { clipDefs: React.ReactNode }) {
  return (
    <defs>
      <pattern id="bulkhead-hatch" patternUnits="userSpaceOnUse" width="5" height="5">
        <path d="M0 5 L5 0" stroke={token('sch-hatch')} strokeWidth="0.9" />
      </pattern>
      {clipDefs}
    </defs>
  );
}
