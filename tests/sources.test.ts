import { describe, expect, it } from 'vitest';
import type { Settings } from '../shared/types';
import { sourceOf } from '../server/manual';
import { detailUrl, pick, slim } from '../server/sources/mpsv';
import { queriesFor } from '../server/sources/linkedin';
import { searchUrl } from '../server/sources/jobscz';

const BRNO = 'Obec/582786';
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
  const profile = { location: 'Brno', keywords: ['react'], mpsvCategories: ['251'] };
  const all = slim([
    raw({}),
    raw({ portalId: 2, profeseCzIsco: { id: 'CzIsco/41100' }, upresnujiciInformace: { cs: 'Administrativa' } }),
    raw({ portalId: 3, mistoVykonuPrace: { obec: { id: 'Obec/554782' } } }),
    raw({ portalId: 4, mistoVykonuPrace: { obec: null, pracoviste: [{ adresa: { obec: { id: BRNO } } }] } }),
    raw({ portalId: 5, profeseCzIsco: { id: 'CzIsco/24310' }, upresnujiciInformace: { cs: 'Marketing, web v Reactu? Ne: React Native' } }),
  ] as never);
  it('keeps vacancies in the town, by CZ-ISCO group or keyword, including ones listed by workplace', () => {
    const jobs = pick(all, profile);
    expect(jobs.map((j) => j.id)).toEqual(['1', '4', '5']);
    expect(jobs[0]).toMatchObject({ title: 'Vývojáři softwaru', company: 'Acme s.r.o.', posted: '2026-11-13', url: detailUrl(1) });
    expect(jobs[0]!.salary.replace(/\s/g, ' ')).toBe('80 000–110 000 Kč / měs');
    expect(jobs[0]!.text).toContain('Kontakt (Úřad práce): Jana Nováková, jana@acme.cz');
    expect(jobs[0]!.text).toContain('Úvazek: HPP plný úvazek');
  });
  it('searches the whole country without a town, and by keyword only without groups', () => {
    expect(pick(all, { ...profile, location: '' }).map((j) => j.id)).toEqual(['1', '3', '4', '5']);
    expect(pick(all, { ...profile, mpsvCategories: [] }).map((j) => j.id)).toEqual(['1', '4', '5']);
    expect(pick(all, { ...profile, mpsvCategories: [], keywords: ['účetní'] })).toEqual([]);
  });
  it('recognises its detail URLs', () => {
    expect(sourceOf(detailUrl(67299316))).toEqual({ source: 'mpsv', sourceId: '67299316' });
  });
});

describe('search queries follow the profile', () => {
  const base = { keywords: ['react', 'vue'], location: 'Ostrava', radiusKm: 20, remote: true, postedWithinDays: 7 };
  it('LinkedIn: one query per keyword in the town, plus remote', () => {
    const q = queriesFor(base);
    expect(q).toHaveLength(4);
    expect(q[0]).toMatchObject({ keywords: 'react', location: 'Ostrava, Czechia', within: 7 * 86400, distance: 12 });
    expect(q[1]).toMatchObject({ location: 'Czechia', remoteOnly: true });
    expect(queriesFor({ ...base, location: '', postedWithinDays: 0 })).toEqual([
      { keywords: 'react', location: 'Czechia', within: undefined, distance: undefined },
      { keywords: 'vue', location: 'Czechia', within: undefined, distance: undefined },
    ]);
  });
  it('jobs.cz: town slug and the nearest supported radius, or the whole country', () => {
    expect(searchUrl('react', { location: 'České Budějovice', radiusKm: 25 }, 1)).toBe(
      'https://www.jobs.cz/prace/ceske-budejovice/?q%5B%5D=react&page=1&locality%5Bradius%5D=20',
    );
    expect(searchUrl('react', { location: '', radiusKm: 25 }, 2)).toBe('https://www.jobs.cz/prace/?q%5B%5D=react&page=2');
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
