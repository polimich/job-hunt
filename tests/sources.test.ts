import { describe, expect, it } from 'vitest';
import type { Settings } from '../shared/types';
import { sourceOf } from '../server/manual';
import { BRNO, detailUrl, pick } from '../server/sources/mpsv';
import { enabledSources, sourceInfo } from '../server/sources/index';

const raw = (over: Record<string, unknown>) => ({
  portalId: 1,
  pozadovanaProfese: { cs: 'Vývojáři softwaru' },
  zamestnavatel: { nazev: 'Acme s.r.o.' },
  profeseCzIsco: { id: 'CzIsco/25120' },
  mistoVykonuPrace: { obec: { id: BRNO } },
  mesicniMzdaOd: 80000,
  mesicniMzdaDo: 110000,
  datumZmeny: '2026-11-13T05:51:18.897Z',
  upresnujiciInformace: { cs: 'React a TypeScript' },
  pracovnePravniVztahy: [{ id: 'PracovnepravniVztah/plny' }],
  prvniKontaktSeZamestnavatelem: { komuSeHlasit: { jmeno: 'Jana', prijmeni: 'Nováková', email: 'jana@acme.cz', telefon: null } },
  ...over,
});

describe('MPSV open data', () => {
  it('keeps developer vacancies in Brno, including ones listed by workplace', () => {
    const jobs = pick([
      raw({}),
      raw({ portalId: 2, profeseCzIsco: { id: 'CzIsco/41100' } }),
      raw({ portalId: 3, mistoVykonuPrace: { obec: { id: 'Obec/554782' } } }),
      raw({ portalId: 4, mistoVykonuPrace: { obec: null, pracoviste: [{ adresa: { obec: { id: BRNO } } }] } }),
    ] as never);
    expect(jobs.map((j) => j.id)).toEqual(['1', '4']);
    expect(jobs[0]).toMatchObject({ title: 'Vývojáři softwaru', company: 'Acme s.r.o.', posted: '2026-11-13', url: detailUrl(1) });
    expect(jobs[0]!.salary.replace(/\s/g, ' ')).toBe('80 000–110 000 Kč / měs');
    expect(jobs[0]!.text).toContain('Kontakt (Úřad práce): Jana Nováková, jana@acme.cz');
    expect(jobs[0]!.text).toContain('Úvazek: HPP plný úvazek');
  });
  it('recognises its detail URLs', () => {
    expect(sourceOf(detailUrl(67299316))).toEqual({ source: 'mpsv', sourceId: '67299316' });
  });
});

describe('source switches', () => {
  const settings = (sources: Settings['sources']) => ({ sources }) as Settings;
  it('searches every keyless source unless switched off, and keyed ones only with a key', () => {
    delete process.env.CAREERJET_KEY;
    delete process.env.JOOBLE_KEY;
    expect(enabledSources(settings({})).map((s) => s.id)).toEqual(['startupjobs', 'mpsv', 'jobscz', 'linkedin']);
    expect(enabledSources(settings({ linkedin: false })).map((s) => s.id)).not.toContain('linkedin');
    process.env.CAREERJET_KEY = 'x';
    expect(enabledSources(settings({})).map((s) => s.id)).toContain('careerjet');
    expect(sourceInfo(settings({})).find((s) => s.id === 'careerjet')!.needsKey!.has).toBe(true);
    delete process.env.CAREERJET_KEY;
  });
});
