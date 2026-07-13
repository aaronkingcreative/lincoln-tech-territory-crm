import assert from 'node:assert/strict';
import { hasMeaningfulGradeEnrollment, hasValue, schoolFlags } from '../lib/coverage';

assert.equal(hasMeaningfulGradeEnrollment({}), false);
assert.equal(hasMeaningfulGradeEnrollment(null), false);
assert.equal(hasMeaningfulGradeEnrollment({ '9': 120, '10': 130 }), true);
assert.equal(schoolFlags({ id: '1', program_notes: 'Strong CTE offerings' }, []).cte, true);
assert.equal(schoolFlags({ id: '1', special_programs: 'Agriculture, welding' }, []).cte, true);
assert.equal(hasValue(''), false);
assert.equal(hasValue('   '), false);
assert.equal(schoolFlags({ id: '1', phone: '', website: '   ', program_notes: '' }, []).phone, false);
assert.equal(schoolFlags({ id: '1', phone: '555-0100', website: 'https://example.edu', program_notes: 'Strong CTE offerings' }, []).ready, true);
assert.equal(schoolFlags({ id: '1', phone: '555-0100' }, []).ready, false);
console.log('Progress metric helper tests passed');
