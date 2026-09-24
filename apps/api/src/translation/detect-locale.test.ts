import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TranslationService } from './translation.service';

/** Detect-only tests — SettingsService is unused by detectLocale. */
function detector() {
  return new TranslationService({ getAiConfigSecrets: async () => null } as never);
}

describe('TranslationService.detectLocale', () => {
  const svc = detector();

  it('detects German hotel chat', () => {
    assert.equal(svc.detectLocale('Zimmer 305 ist schmutzig, bitte reinigen'), 'de');
    assert.equal(svc.detectLocale('Abreise heute, Danke'), 'de');
  });

  it('detects English hotel chat', () => {
    assert.equal(svc.detectLocale('Please clean the room, guest needs towels'), 'en');
  });

  it('detects Turkish hotel chat', () => {
    assert.equal(svc.detectLocale('Oda kirli, lütfen temizleyin'), 'tr');
    assert.equal(svc.detectLocale('Misafir çıkış yaptı'), 'tr');
  });

  it('detects Spanish and Portuguese', () => {
    assert.equal(svc.detectLocale('La habitación está sucia, gracias'), 'es');
    assert.equal(svc.detectLocale('O quarto está sujo, obrigado'), 'pt');
    assert.equal(svc.detectLocale('Por favor limpe o quarto, obrigado'), 'pt');
  });

  it('detects Ukrainian via Cyrillic', () => {
    assert.equal(svc.detectLocale('Кімната брудна, будь ласка приберіть'), 'uk');
  });

  it('does not guess English when uncertain', () => {
    assert.equal(svc.detectLocale('303'), null);
    assert.equal(svc.detectLocale('ok'), null);
  });

  it('keeps plausible ES/TR/UK translations', () => {
    assert.equal(
      svc.translationLooksPlausible('Por favor limpia la habitación, gracias', 'es'),
      true,
    );
    assert.equal(svc.translationLooksPlausible('Lütfen odayı temizleyin', 'tr'), true);
    assert.equal(svc.translationLooksPlausible('Будь ласка, приберіть кімнату', 'uk'), true);
    assert.equal(svc.translationLooksPlausible('Bitte Zimmer reinigen', 'pt'), false);
  });
});
