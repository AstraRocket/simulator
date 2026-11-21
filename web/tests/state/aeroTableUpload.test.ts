// @vitest-environment jsdom
// cspell:ignore draglookup -- OpenRocket .ork element name
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore, selectActive } from '../../src/state/store';
import { aeroTablesOf } from '../../src/services/flight/aeroTables';

const s = () => useWorkspaceStore.getState();
const active = () => selectActive(s());
const TABLE = { file: 'drag.csv', rows: ['mach,cd', '0.3,0.35'] };

describe('setAeroTable', () => {
  beforeEach(() => s().resetWorkspace());

  it('gives the active simulation the table, and removing it leaves no passthrough', () => {
    s().setAeroTable('drag', TABLE);
    expect(aeroTablesOf(active().xmlExtra)).toEqual({ dragLookup: TABLE.rows });
    s().setAeroTable('drag', null);
    expect(active().xmlExtra).toBeUndefined();
  });

  it('is one undo step', () => {
    s().setAeroTable('drag', TABLE);
    s().undo();
    expect(active().xmlExtra).toBeUndefined();
  });

  it('travels with a duplicate', () => {
    s().setAeroTable('drag', TABLE);
    s().duplicateSim(active().id);
    expect(aeroTablesOf(active().xmlExtra)).toEqual({ dragLookup: TABLE.rows });
  });
});
