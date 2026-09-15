import * as React from 'react';
import { INDIAN_STATES } from '@pharmaos/shared';
import { Select } from './input';

export const StateSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>((props, ref) => (
  <Select ref={ref} {...props}>
    <option value="">Select state</option>
    {INDIAN_STATES.map((s) => (
      <option key={s.code} value={s.code}>
        {s.code} · {s.name}
      </option>
    ))}
  </Select>
));
StateSelect.displayName = 'StateSelect';
