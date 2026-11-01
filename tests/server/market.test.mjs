import test from 'node:test';
import assert from 'node:assert/strict';
import { marketCategory } from '../../src/server/features/clubs/team.mjs';
test('market separates explicit announcements, speculation and absence reporting', () => {
  assert.equal(
    marketCategory('Athletico anuncia contratação de atacante'),
    'confirmed',
  );
  assert.equal(marketCategory('Coritiba negocia com atacante'), 'rumors');
  assert.equal(
    marketCategory('Athletico não confirma contratação de atacante'),
    'rumors',
  );
  assert.equal(
    marketCategory('Coritiba descarta contratação de atacante'),
    'rumors',
  );
  assert.equal(
    marketCategory('Lesão tira atacante de jogo do Athletico'),
    'absences',
  );
  assert.equal(marketCategory('Coritiba vence e sobe na classificação'), null);
});
