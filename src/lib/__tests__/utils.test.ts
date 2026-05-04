import { describe, it, expect } from 'vitest';
import { mergeByBroker } from '../utils';

describe('mergeByBroker', () => {
  it('replaces only the slice of the broker carried by the incoming items', () => {
    const prev = [
      { broker: 'fidelity', id: 'f1' },
      { broker: 'fidelity', id: 'f2' },
      { broker: 'morgan_stanley', id: 'm1' },
    ];
    const incoming = [{ broker: 'fidelity', id: 'f3' }];
    const next = mergeByBroker(prev, incoming);
    expect(next).toHaveLength(2);
    expect(next.find((x) => x.id === 'm1')).toBeDefined();
    expect(next.find((x) => x.id === 'f3')).toBeDefined();
    expect(next.find((x) => x.id === 'f1')).toBeUndefined();
  });

  it('returns the previous list unchanged when incoming is empty', () => {
    const prev = [{ broker: 'fidelity', id: 'f1' }];
    expect(mergeByBroker(prev, [])).toBe(prev);
  });

  it('appends when no previous slice for that broker exists', () => {
    const prev = [{ broker: 'fidelity', id: 'f1' }];
    const next = mergeByBroker(prev, [{ broker: 'morgan_stanley', id: 'm1' }]);
    expect(next).toHaveLength(2);
  });
});
