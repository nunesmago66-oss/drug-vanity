import { DEFAULT_CATALOG, type CatalogEntry } from "./catalog";

export type MeaningFamily = "palavra" | "abreviação" | "nome" | "fonético";
export interface MeaningCandidate extends CatalogEntry {
  family: MeaningFamily;
  language: string;
  pronunciation: number;
  aesthetics: number;
  relevance: number;
}
// Explicit glosses, not inferred translations. Accentless spellings are marked.
const DICTIONARIES: Array<[string, MeaningFamily, string]> = [
  [
    "Português",
    "palavra",
    "oi:saudação|sim:afirmação|sol:estrela solar|lua:satélite natural|mar:oceano|rio:curso de água|ar:atmosfera|lar:casa|luz:claridade|paz:tranquilidade|voz:som da fala|som:efeito sonoro|cor:tonalidade|mel:alimento doce|sal:tempero|rei:monarca|dom:talento|bom:de boa qualidade|boa:de boa qualidade|bem:algo positivo|amo:forma de amar|ama:forma de amar|elo:ligação|eco:repetição de som|era:período|fim:final|dia:dia|ano:ano|asa:parte usada para voar|ave:pássaro|ema:ave|ovo:ovo|uva:fruta|noz:fruto|pai:progenitor|tia:parente|tio:parente|teu:possessivo|sua:possessivo|meu:possessivo|ela:pronome|ele:pronome|eu:pronome|tu:pronome|um:número|uma:artigo|ou:alternativa|ver:perceber pela visão|ler:interpretar escrita|dar:oferecer|ser:existir|ter:possuir|ir:deslocar-se|vim:forma de vir|vai:forma de ir|vem:forma de vir|sou:forma de ser|faz:forma de fazer|ceu:céu (sem acento)|cha:chá (sem acento)|fe:fé (sem acento)|mae:mãe (sem acento)",
  ],
  [
    "Inglês",
    "palavra",
    "yes:sim|no:não|hi:olá|hey:saudação|bye:tchau|go:ir|up:para cima|on:ligado|in:dentro|out:fora|off:desligado|one:um|two:dois|six:seis|ten:dez|sky:céu|sun:sol|sea:mar|ice:gelo|air:ar|dew:orvalho|fog:neblina|oak:carvalho|elm:olmo|ash:freixo / cinza|ivy:hera|bay:baía|gem:joia|jet:jato / azeviche|ace:ás|joy:alegria|wow:surpresa|awe:admiração|art:arte|ink:tinta|pen:caneta|key:chave|fox:raposa|cat:gato|dog:cachorro|owl:coruja|bee:abelha|ant:formiga|elk:alce|ram:carneiro|cub:filhote|fin:barbatana|bud:broto|red:vermelho|hot:quente|wet:molhado|dry:seco|new:novo|old:antigo|big:grande|fit:em forma|fun:diversão|win:vencer|top:topo|pro:profissional|ray:raio|eye:olho|ear:orelha|lip:lábio|hug:abraço|tea:chá|jam:geleia|pie:torta|nut:noz|fig:figo|pea:ervilha|rye:centeio|oat:aveia|map:mapa|now:agora|day:dia|eve:véspera|you:você|we:nós|us:nós|me:eu|my:meu|be:ser|do:fazer|say:dizer|see:ver|fly:voar|run:correr|try:tentar|aim:mirar",
  ],
  [
    "Espanhol",
    "palavra",
    "oro:ouro|rey:rei|soy:sou|muy:muito|sin:sem|con:com|dos:dois|uno:um|paz:paz|luz:luz|sol:sol|mar:mar|ola:onda|ojo:olho|pan:pão|sal:sal|voz:voz|sur:sul|mes:mês|ala:asa|amo:amo",
  ],
  [
    "Italiano",
    "palavra",
    "oro:ouro|blu:azul|due:dois|tre:três|uno:um|re:rei|io:eu|tu:você|noi:nós|voi:vocês|ama:ama|bel:belo|eco:eco|ala:asa|via:rua / caminho",
  ],
  [
    "Francês",
    "palavra",
    "oui:sim|non:não|ami:amigo|air:ar|art:arte|mer:mar|lac:lago|or:ouro|roi:rei|vie:vida|feu:fogo|eau:água|sel:sal|bon:bom|bel:belo|une:uma|un:um|toi:você|moi:eu|ici:aqui",
  ],
  [
    "Latim",
    "palavra",
    "lux:luz|rex:rei|leo:leão|sol:sol|pax:paz|vox:voz|ars:arte|vis:força|via:caminho|cor:coração|nox:noite|lex:lei|res:coisa",
  ],
  [
    "Alemão",
    "palavra",
    "ja:sim|du:você|wir:nós|ich:eu|gut:bom|rot:vermelho|tag:dia|see:lago|eis:gelo|neu:novo|alt:antigo|tor:portão",
  ],
  [
    "Japonês (romanizado)",
    "palavra",
    "ai:amor|ki:energia / espírito|yu:água quente|umi:mar|ame:chuva|ao:azul",
  ],
  [
    "Digital / contextual",
    "abreviação",
    "bj:beijo|bjs:beijos|mwa:onomatopeia de beijo|mua:onomatopeia de beijo|yez:variação estilizada de yes|ily:I love you|idk:I don't know|imo:In my opinion|irl:In real life|dm:Direct message|pm:Private message|ty:Thank you|np:No problem|rn:Right now|fr:For real|tbh:To be honest|btw:By the way|fyi:For your information|diy:Do it yourself|aka:Also known as|asap:As soon as possible|xox:beijos e abraços|kk:risada / confirmação contextual|sos:sinal de socorro|ai:Artificial intelligence|vr:Virtual reality|ar:Augmented reality|ux:User experience|ui:User interface",
  ],
  [
    "Nomes / apelidos",
    "nome",
    "ana:nome próprio|lia:nome próprio|mia:nome próprio|eva:nome próprio|ivo:nome próprio|ian:nome próprio|eli:nome próprio|leo:nome / apelido|rui:nome próprio|lu:apelido|liz:nome / apelido|liv:nome próprio|kai:nome próprio|noa:nome próprio|nia:nome próprio|zoe:nome próprio|ada:nome próprio|ava:nome próprio|bea:apelido|ben:nome / apelido|bob:apelido|sam:apelido|tom:apelido|tim:apelido|jay:nome / apelido|kim:nome próprio|roy:nome próprio|max:nome / apelido|nix:apelido estilizado",
  ],
];

export function phoneticScore(code: string): number {
  if (/^[aeiou]{2,3}$/.test(code)) return 65;
  if (/^([bcdfghjklmnpqrstvwxyz][aeiou]|[aeiou][bcdfghjklmnpqrstvwxyz])$/.test(code)) return 95;
  if (/^[bcdfghjklmnpqrstvwxyz][aeiou][bcdfghjklmnpqrstvwxyz]$/.test(code)) return 90;
  if (/^[aeiou][bcdfghjklmnpqrstvwxyz][aeiou]$/.test(code)) return 98;
  if (/^(ch|sh|th|ph|tr|br|cr|dr|fr|gr|pr|bl|cl|fl|gl|pl)[aeiou]$/.test(code)) return 80;
  if (/^[bcdfghjklmnpqrstvwxyz][aeiou]{2}$/.test(code)) return 85;
  return /[aeiou]/.test(code) ? 55 : 20;
}

/** A subjective stylistic heuristic, never a promise of beauty or exclusivity. */
export function aestheticScore(code: string): number {
  return Math.min(
    100,
    Math.round(
      phoneticScore(code) * 0.65 +
        15 +
        (/^[lmnrsv]/.test(code) ? 10 : 0) +
        (/[ixy]$/.test(code) ? 8 : 0) +
        (new Set(code).size === code.length ? 5 : 0),
    ),
  );
}

export function generateMeaningCandidates(): MeaningCandidate[] {
  const map = new Map<string, MeaningCandidate>();
  const add = (code: string, meaning: string, language: string, family: MeaningFamily) => {
    if (!/^[a-z]{2,3}$/.test(code)) return;
    const prior = map.get(code);
    if (prior) {
      if (family !== "fonético" && !prior.meaning.includes(`${language}: ${meaning}`)) {
        prior.meaning += `; ${language}: ${meaning}`;
        if (!prior.language.includes(language)) prior.language += ` / ${language}`;
      }
      return;
    }
    const pronunciation = phoneticScore(code),
      aesthetics = aestheticScore(code);
    const meaningWeight =
      family === "palavra" ? 100 : family === "abreviação" ? 85 : family === "nome" ? 80 : 0;
    map.set(code, {
      code,
      meaning: family === "fonético" ? meaning : `${language}: ${meaning}`,
      language,
      family,
      pronunciation,
      aesthetics,
      relevance: Math.round(meaningWeight * 0.5 + pronunciation * 0.3 + aesthetics * 0.2),
      category: family === "abreviação" ? "abreviações" : "outros",
      kind: family === "abreviação" ? "sigla" : family === "fonético" ? "personalizado" : "termo",
    });
  };
  for (const [language, family, data] of DICTIONARIES)
    for (const item of data.split("|")) {
      const [code, meaning] = item.split(":");
      if (code && meaning) add(code, meaning, language, family);
    }
  for (const e of DEFAULT_CATALOG)
    if (!map.has(e.code))
      add(
        e.code,
        e.meaning,
        "Catálogo",
        e.kind === "sigla" || e.category === "gaming" || e.category === "abreviações"
          ? "abreviação"
          : "palavra",
      );
  const vowels = "aeiou",
    consonants = "bcdfghjklmnpqrstvwxyz";
  for (const c of consonants)
    for (const v of vowels) {
      add(
        c + v,
        "Criação fonética CV; sem significado literal confirmado",
        "Inventado",
        "fonético",
      );
      add(
        v + c,
        "Criação fonética VC; sem significado literal confirmado",
        "Inventado",
        "fonético",
      );
      for (const tail of consonants)
        add(
          c + v + tail,
          "Criação fonética CVC; sem significado literal confirmado",
          "Inventado",
          "fonético",
        );
      for (const tail of vowels) {
        add(
          v + c + tail,
          "Criação fonética VCV; sem significado literal confirmado",
          "Inventado",
          "fonético",
        );
        add(
          c + v + tail,
          "Criação fonética CVV; sem significado literal confirmado",
          "Inventado",
          "fonético",
        );
      }
    }
  for (const pair of [
    "ch",
    "sh",
    "th",
    "ph",
    "tr",
    "br",
    "cr",
    "dr",
    "fr",
    "gr",
    "pr",
    "bl",
    "cl",
    "fl",
    "gl",
    "pl",
  ])
    for (const v of vowels)
      add(
        pair + v,
        "Grupo consonantal + vogal; sem significado literal confirmado",
        "Inventado",
        "fonético",
      );
  return [...map.values()].sort(
    (a, b) => b.relevance - a.relevance || a.code.localeCompare(b.code),
  );
}

export const MEANING_PAGE = 250;
export function expandMeaningLimit(current: number, total: number): number {
  return Math.min(total, current + MEANING_PAGE);
}
