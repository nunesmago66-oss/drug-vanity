export const CATEGORIES = [
  "luxo",
  "riqueza",
  "status",
  "poder",
  "gaming",
  "abreviações",
  "inglês",
  "outros",
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * termo = significado/expansão estabelecido (palavra, sigla consagrada, símbolo).
 * sigla = sigla/abreviação — interpretação contextual, não um significado oficial.
 * personalizado = definido pelo usuário.
 */
export const KINDS = ["termo", "sigla", "personalizado"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABEL: Record<Kind, string> = {
  termo: "termo",
  sigla: "sigla/abreviação",
  personalizado: "personalizado",
};

export interface CatalogEntry {
  code: string;
  meaning: string;
  category: Category;
  kind: Kind;
  favorite?: boolean;
  custom?: boolean;
}

const e = (code: string, meaning: string, category: Category, kind: Kind): CatalogEntry => ({
  code,
  meaning,
  category,
  kind,
});

export const DEFAULT_CATALOG: CatalogEntry[] = [
  // 2 caracteres
  e("gg", "Good Game", "gaming", "termo"),
  e("wp", "Well Played", "gaming", "termo"),
  e("gl", "Good Luck", "gaming", "termo"),
  e("op", "Overpowered", "gaming", "termo"),
  e("xp", "Experience (pontos de experiência)", "gaming", "termo"),
  e("hp", "Health Points (pontos de vida)", "gaming", "termo"),
  e("ez", "Easy (gíria de jogos)", "gaming", "sigla"),
  e("gm", "Good Morning", "abreviações", "sigla"),
  e("gn", "Good Night", "abreviações", "sigla"),
  e("lv", "Love (abreviação)", "abreviações", "sigla"),
  e("hq", "Headquarters (sede)", "abreviações", "sigla"),
  e("vp", "Vice-President", "status", "sigla"),
  e("qn", "Queen (abreviação)", "status", "sigla"),
  e("au", "Ouro (símbolo químico Au)", "riqueza", "termo"),
  e("ag", "Prata (símbolo químico Ag)", "riqueza", "termo"),
  e("ok", "OK", "inglês", "termo"),
  e("go", "Go (ir / vamos)", "inglês", "termo"),
  e("up", "Up (para cima)", "inglês", "termo"),
  e("yo", "Yo (saudação informal)", "inglês", "termo"),
  // 3 caracteres
  e("vip", "Very Important Person", "status", "termo"),
  e("ceo", "Chief Executive Officer", "status", "termo"),
  e("mvp", "Most Valuable Player", "status", "termo"),
  e("pro", "Professional", "status", "termo"),
  e("top", "Topo", "status", "termo"),
  e("one", "Um / único", "status", "termo"),
  e("lux", "Luxury (luxo)", "luxo", "termo"),
  e("gem", "Gema / joia", "luxo", "termo"),
  e("roy", "Royal (interpretação contextual; também nome próprio)", "luxo", "sigla"),
  e("ace", "Ás / excelência", "poder", "termo"),
  e("rex", "Rei (latim)", "poder", "termo"),
  e("max", "Máximo", "poder", "termo"),
  e("god", "Deus", "poder", "termo"),
  e("war", "Guerra", "poder", "termo"),
  e("win", "Vitória / vencer", "poder", "termo"),
  e("usd", "Dólar americano (código ISO 4217)", "riqueza", "termo"),
  e("eur", "Euro (código ISO 4217)", "riqueza", "termo"),
  e("btc", "Bitcoin (ticker)", "riqueza", "termo"),
  e("oro", "Ouro (espanhol/italiano)", "riqueza", "termo"),
  e("rpg", "Role-Playing Game", "gaming", "termo"),
  e("fps", "First-Person Shooter", "gaming", "termo"),
  e("afk", "Away From Keyboard", "gaming", "termo"),
  e("1v1", "Um contra um (one versus one)", "gaming", "termo"),
  e("lvl", "Level (nível)", "gaming", "sigla"),
  e("pog", "Expressão de empolgação (de “PogChamp”)", "gaming", "sigla"),
  e("brb", "Be Right Back", "abreviações", "sigla"),
  e("lol", "Laughing Out Loud", "abreviações", "sigla"),
  e("omg", "Oh My God", "abreviações", "sigla"),
  e("gtg", "Got To Go", "abreviações", "sigla"),
  e("zen", "Calma / equilíbrio", "inglês", "termo"),
  e("neo", "Novo", "inglês", "termo"),
  e("sky", "Céu", "inglês", "termo"),
  e("key", "Chave", "inglês", "termo"),
  e("fun", "Diversão", "inglês", "termo"),
  e("art", "Arte", "inglês", "termo"),
  e("fox", "Raposa", "inglês", "termo"),
];
