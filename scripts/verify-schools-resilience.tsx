import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SchoolsClient from '../components/SchoolsClient';
import { formatDateOnly } from '../lib/date-display';

const html = renderToStaticMarkup(<SchoolsClient rows={[{
  s: { id: 'school-with-optional-data-missing', name: 'Resilient High School' },
  latestNote: undefined,
  miss: undefined,
}]} />);

assert.match(html, /Resilient High School/);
assert.match(html, /No notes yet/);
assert.match(html, /No visit logged/);
assert.match(html, /Missing bell schedule/);
assert.match(html, /School.*Phone.*Website.*HS Last Visit.*Bell Schedule.*Notes.*Missing Fields.*Actions/s);

for (const value of [undefined, null, '', 42, 'not-a-date', '2025-02-30']) {
  assert.equal(formatDateOnly(value, 'No visit logged'), 'No visit logged');
}
assert.equal(formatDateOnly('2025-02-28'), 'Feb 28, 2025');

console.log('Schools resilience checks passed.');
