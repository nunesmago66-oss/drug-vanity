export type AbbreviationCategory =
  | "Crypto & Blockchain"
  | "Finance & Business"
  | "Technology"
  | "Internet & Social"
  | "Gaming & Esports"
  | "Science & Education"
  | "Health"
  | "Entertainment"
  | "Relationships"
  | "Travel & Geography"
  | "Security & Privacy"
  | "Portuguese Slang"
  | "Spanish Slang"
  | "French"
  | "German"
  | "Italian"
  | "Chinese"
  | "Russian"
  | "Japanese & Korean"
  | "General English"
  | "Countries & Territories"
  | "Languages"
  | "States & Provinces"
  | "Chemistry"
  | "Airports & Aviation";
export interface AbbreviationRecord {
  id: string;
  abbreviation: string;
  meaning: string;
  language: string;
  category: AbbreviationCategory;
  description?: string;
  aliases: string[];
  related: string[];
  sourceNote: string;
  /** Country/region where the usage is common ("Global" when not regional). */ region?: string;
  /** How the abbreviation is used: everyday, regional, technical/standard or rare. */ kind?: AbbreviationKind;
  /** true only when the record comes from a documented, citable source. */ verified?: boolean;
  sourceUrl?: string;
  packId?: string;
}
export type AbbreviationKind = "popular" | "regional" | "technical" | "rare";
export const ABBREVIATION_KINDS: Record<AbbreviationKind, string> = {
  popular: "Popular",
  regional: "Regional",
  technical: "Técnica / padrão",
  rare: "Rara",
};
// A deliberately curated seed, not a fabricated 10,000-row filler dataset. Ambiguous terms have separate meanings.
const rows: Array<[string, string, string, AbbreviationCategory, string?, string?, string?]> = [
  [
    "BTC",
    "Bitcoin",
    "English",
    "Crypto & Blockchain",
    "Ticker de Bitcoin.",
    "bitcoin",
    "ETH,SOL,XRP",
  ],
  [
    "ETH",
    "Ether (Ethereum)",
    "English",
    "Crypto & Blockchain",
    "Ativo nativo da rede Ethereum.",
    "ethereum ether",
    "BTC,SOL",
  ],
  [
    "SOL",
    "Solana",
    "English",
    "Crypto & Blockchain",
    "Ativo nativo da rede Solana.",
    "solana",
    "ETH,BTC",
  ],
  [
    "XRP",
    "XRP Ledger digital asset",
    "English",
    "Crypto & Blockchain",
    "Ativo digital associado ao XRP Ledger.",
    "ripple",
    "BTC,ETH",
  ],
  [
    "BNB",
    "BNB",
    "English",
    "Crypto & Blockchain",
    "Ativo do ecossistema BNB.",
    "binance coin",
    "BTC,ETH",
  ],
  [
    "ADA",
    "Cardano",
    "English",
    "Crypto & Blockchain",
    "Ticker do ativo nativo Cardano.",
    "cardano",
    "ETH,SOL",
  ],
  [
    "DOGE",
    "Dogecoin",
    "English",
    "Crypto & Blockchain",
    "Ticker de Dogecoin.",
    "dogecoin",
    "SHIB,BTC",
  ],
  [
    "LTC",
    "Litecoin",
    "English",
    "Crypto & Blockchain",
    "Ticker de Litecoin.",
    "litecoin",
    "BTC,BCH",
  ],
  [
    "NFT",
    "Non-Fungible Token",
    "English",
    "Crypto & Blockchain",
    "Token não fungível.",
    "non fungible token",
    "DAO,DeFi",
  ],
  [
    "DeFi",
    "Decentralized Finance",
    "English",
    "Crypto & Blockchain",
    "Finanças descentralizadas.",
    "decentralized finance",
    "DEX,DAO",
  ],
  [
    "DEX",
    "Decentralized Exchange",
    "English",
    "Crypto & Blockchain",
    "Exchange descentralizada.",
    "decentralized exchange",
    "DeFi,CEX",
  ],
  [
    "DAO",
    "Decentralized Autonomous Organization",
    "English",
    "Crypto & Blockchain",
    "Organização autônoma descentralizada.",
    "decentralized autonomous organization",
    "DeFi,NFT",
  ],
  [
    "CEX",
    "Centralized Exchange",
    "English",
    "Crypto & Blockchain",
    "Exchange centralizada.",
    "centralized exchange",
    "DEX,KYC",
  ],
  [
    "ICO",
    "Initial Coin Offering",
    "English",
    "Crypto & Blockchain",
    "Oferta inicial de moedas ou tokens.",
    "initial coin offering",
    "IDO,IPO",
  ],
  [
    "ATH",
    "All-Time High",
    "English",
    "Finance & Business",
    "Maior valor histórico.",
    "record high",
    "ATL,ROI",
  ],
  [
    "ATL",
    "All-Time Low",
    "English",
    "Finance & Business",
    "Menor valor histórico.",
    "record low",
    "ATH,ROI",
  ],
  [
    "USD",
    "United States Dollar",
    "English",
    "Finance & Business",
    "Código ISO 4217 do dólar dos EUA.",
    "us dollar",
    "EUR,BRL",
  ],
  ["EUR", "Euro", "English", "Finance & Business", "Código ISO 4217 do euro.", "euro", "USD,GBP"],
  [
    "GBP",
    "Pound Sterling",
    "English",
    "Finance & Business",
    "Código ISO 4217 da libra esterlina.",
    "british pound",
    "EUR,USD",
  ],
  [
    "BRL",
    "Brazilian Real",
    "English",
    "Finance & Business",
    "Código ISO 4217 do real brasileiro.",
    "real brasileiro",
    "USD,EUR",
  ],
  [
    "JPY",
    "Japanese Yen",
    "English",
    "Finance & Business",
    "Código ISO 4217 do iene.",
    "yen",
    "CNY,USD",
  ],
  [
    "ROI",
    "Return on Investment",
    "English",
    "Finance & Business",
    "Retorno sobre investimento.",
    "return on investment",
    "KPI,ROAS",
  ],
  [
    "ROAS",
    "Return on Ad Spend",
    "English",
    "Finance & Business",
    "Retorno sobre gasto com anúncios.",
    "return on advertising spend",
    "ROI,CPA",
  ],
  [
    "KPI",
    "Key Performance Indicator",
    "English",
    "Finance & Business",
    "Indicador-chave de desempenho.",
    "key performance indicator",
    "OKR,ROI",
  ],
  [
    "OKR",
    "Objectives and Key Results",
    "English",
    "Finance & Business",
    "Objetivos e resultados-chave.",
    "objectives key results",
    "KPI",
  ],
  [
    "CEO",
    "Chief Executive Officer",
    "English",
    "Finance & Business",
    "Diretor executivo.",
    "chief executive officer",
    "CFO,CTO",
  ],
  [
    "CFO",
    "Chief Financial Officer",
    "English",
    "Finance & Business",
    "Diretor financeiro.",
    "chief financial officer",
    "CEO,CTO",
  ],
  [
    "CTO",
    "Chief Technology Officer",
    "English",
    "Finance & Business",
    "Diretor de tecnologia.",
    "chief technology officer",
    "CEO,CIO",
  ],
  [
    "COO",
    "Chief Operating Officer",
    "English",
    "Finance & Business",
    "Diretor de operações.",
    "chief operating officer",
    "CEO,CFO",
  ],
  [
    "IPO",
    "Initial Public Offering",
    "English",
    "Finance & Business",
    "Oferta pública inicial de ações.",
    "initial public offering",
    "ICO",
  ],
  [
    "B2B",
    "Business to Business",
    "English",
    "Finance & Business",
    "Modelo comercial entre empresas.",
    "business to business",
    "B2C,SaaS",
  ],
  [
    "B2C",
    "Business to Consumer",
    "English",
    "Finance & Business",
    "Modelo comercial de empresa para consumidor.",
    "business to consumer",
    "B2B,D2C",
  ],
  [
    "SaaS",
    "Software as a Service",
    "English",
    "Technology",
    "Software como serviço.",
    "software as a service",
    "PaaS,IaaS",
  ],
  [
    "AI",
    "Artificial Intelligence",
    "English",
    "Technology",
    "Inteligência artificial.",
    "artificial intelligence",
    "ML,LLM",
  ],
  [
    "ML",
    "Machine Learning",
    "English",
    "Technology",
    "Aprendizado de máquina.",
    "machine learning",
    "AI,DL",
  ],
  [
    "DL",
    "Deep Learning",
    "English",
    "Technology",
    "Aprendizado profundo.",
    "deep learning",
    "AI,ML",
  ],
  [
    "LLM",
    "Large Language Model",
    "English",
    "Technology",
    "Modelo de linguagem de grande escala.",
    "large language model",
    "AI,NLP",
  ],
  [
    "NLP",
    "Natural Language Processing",
    "English",
    "Technology",
    "Processamento de linguagem natural.",
    "natural language processing",
    "LLM,AI",
  ],
  [
    "API",
    "Application Programming Interface",
    "English",
    "Technology",
    "Interface de programação de aplicações.",
    "application programming interface",
    "SDK,HTTP",
  ],
  [
    "SDK",
    "Software Development Kit",
    "English",
    "Technology",
    "Kit de desenvolvimento de software.",
    "software development kit",
    "API,IDE",
  ],
  [
    "URL",
    "Uniform Resource Locator",
    "English",
    "Technology",
    "Endereço de um recurso na web.",
    "uniform resource locator",
    "URI,HTTP",
  ],
  [
    "URI",
    "Uniform Resource Identifier",
    "English",
    "Technology",
    "Identificador de recurso.",
    "uniform resource identifier",
    "URL,URN",
  ],
  [
    "HTTP",
    "Hypertext Transfer Protocol",
    "English",
    "Technology",
    "Protocolo de transferência da web.",
    "hypertext transfer protocol",
    "HTTPS,URL",
  ],
  [
    "HTTPS",
    "Hypertext Transfer Protocol Secure",
    "English",
    "Security & Privacy",
    "HTTP protegido por TLS.",
    "secure http",
    "HTTP,TLS",
  ],
  [
    "HTML",
    "HyperText Markup Language",
    "English",
    "Technology",
    "Linguagem de marcação para páginas web.",
    "hypertext markup language",
    "CSS,JS",
  ],
  [
    "CSS",
    "Cascading Style Sheets",
    "English",
    "Technology",
    "Folhas de estilo em cascata.",
    "cascading style sheets",
    "HTML,JS",
  ],
  [
    "JS",
    "JavaScript",
    "English",
    "Technology",
    "Linguagem de programação.",
    "javascript",
    "TS,HTML",
  ],
  [
    "TS",
    "TypeScript",
    "English",
    "Technology",
    "Superset tipado de JavaScript.",
    "typescript",
    "JS,JSX",
  ],
  [
    "JSON",
    "JavaScript Object Notation",
    "English",
    "Technology",
    "Formato de intercâmbio de dados.",
    "javascript object notation",
    "XML,YAML",
  ],
  [
    "SQL",
    "Structured Query Language",
    "English",
    "Technology",
    "Linguagem para bancos relacionais.",
    "structured query language",
    "DB,NoSQL",
  ],
  [
    "CPU",
    "Central Processing Unit",
    "English",
    "Technology",
    "Unidade central de processamento.",
    "processor",
    "GPU,RAM",
  ],
  [
    "GPU",
    "Graphics Processing Unit",
    "English",
    "Technology",
    "Processador gráfico e paralelo.",
    "graphics card",
    "CPU,VRAM",
  ],
  [
    "RAM",
    "Random Access Memory",
    "English",
    "Technology",
    "Memória de acesso aleatório.",
    "random access memory",
    "ROM,CPU",
  ],
  [
    "ROM",
    "Read-Only Memory",
    "English",
    "Technology",
    "Memória somente de leitura.",
    "read only memory",
    "RAM,BIOS",
  ],
  [
    "SSD",
    "Solid-State Drive",
    "English",
    "Technology",
    "Unidade de armazenamento em estado sólido.",
    "solid state drive",
    "HDD,NVMe",
  ],
  [
    "HDD",
    "Hard Disk Drive",
    "English",
    "Technology",
    "Unidade de armazenamento magnético.",
    "hard disk drive",
    "SSD",
  ],
  [
    "OS",
    "Operating System",
    "English",
    "Technology",
    "Sistema operacional.",
    "operating system",
    "iOS,GUI",
  ],
  [
    "GUI",
    "Graphical User Interface",
    "English",
    "Technology",
    "Interface gráfica.",
    "graphical user interface",
    "CLI,UX",
  ],
  [
    "UX",
    "User Experience",
    "English",
    "Technology",
    "Experiência do usuário.",
    "user experience",
    "UI,GUI",
  ],
  [
    "UI",
    "User Interface",
    "English",
    "Technology",
    "Interface do usuário.",
    "user interface",
    "UX,GUI",
  ],
  [
    "VPN",
    "Virtual Private Network",
    "English",
    "Security & Privacy",
    "Rede privada virtual.",
    "virtual private network",
    "DNS,TLS",
  ],
  [
    "DNS",
    "Domain Name System",
    "English",
    "Technology",
    "Sistema de nomes de domínio.",
    "domain name system",
    "IP,URL",
  ],
  [
    "IP",
    "Internet Protocol",
    "English",
    "Technology",
    "Protocolo de endereçamento e roteamento.",
    "internet protocol",
    "TCP,DNS",
  ],
  [
    "TCP",
    "Transmission Control Protocol",
    "English",
    "Technology",
    "Protocolo de transporte confiável.",
    "transmission control protocol",
    "IP,UDP",
  ],
  [
    "UDP",
    "User Datagram Protocol",
    "English",
    "Technology",
    "Protocolo de transporte sem conexão.",
    "user datagram protocol",
    "TCP,IP",
  ],
  [
    "TLS",
    "Transport Layer Security",
    "English",
    "Security & Privacy",
    "Protocolo criptográfico para comunicações.",
    "transport layer security",
    "SSL,HTTPS",
  ],
  [
    "MFA",
    "Multi-Factor Authentication",
    "English",
    "Security & Privacy",
    "Autenticação com múltiplos fatores.",
    "multi factor authentication",
    "2FA,OTP",
  ],
  [
    "2FA",
    "Two-Factor Authentication",
    "English",
    "Security & Privacy",
    "Autenticação de dois fatores.",
    "two factor authentication",
    "MFA,OTP",
  ],
  [
    "OTP",
    "One-Time Password",
    "English",
    "Security & Privacy",
    "Senha de uso único.",
    "one time password",
    "2FA,MFA",
  ],
  [
    "LOL",
    "Laughing Out Loud",
    "English",
    "Internet & Social",
    "Expressa riso em conversas digitais.",
    "laughing out loud",
    "LMAO,ROFL",
  ],
  [
    "LMAO",
    "Laughing My Ass Off",
    "English",
    "Internet & Social",
    "Gíria informal para riso intenso.",
    "laughing my ass off",
    "LOL,ROFL",
  ],
  [
    "ROFL",
    "Rolling On the Floor Laughing",
    "English",
    "Internet & Social",
    "Expressa riso muito intenso.",
    "rolling on the floor laughing",
    "LOL,LMAO",
  ],
  ["BRB", "Be Right Back", "English", "Internet & Social", "Volto já.", "be right back", "AFK,BBL"],
  ["BTW", "By The Way", "English", "Internet & Social", "A propósito.", "by the way", "FYI,IMO"],
  [
    "IMO",
    "In My Opinion",
    "English",
    "Internet & Social",
    "Na minha opinião.",
    "in my opinion",
    "IMHO,TBH",
  ],
  [
    "IMHO",
    "In My Humble Opinion",
    "English",
    "Internet & Social",
    "Na minha humilde opinião.",
    "in my humble opinion",
    "IMO,TBH",
  ],
  [
    "TBH",
    "To Be Honest",
    "English",
    "Internet & Social",
    "Para ser sincero.",
    "to be honest",
    "NGL,FR",
  ],
  [
    "NGL",
    "Not Gonna Lie",
    "English",
    "Internet & Social",
    "Sendo sincero.",
    "not going to lie",
    "TBH,FR",
  ],
  ["IDK", "I Don't Know", "English", "Internet & Social", "Não sei.", "i do not know", "IDC,IKR"],
  [
    "IDC",
    "I Don't Care",
    "English",
    "Internet & Social",
    "Não me importo.",
    "i do not care",
    "IDK",
  ],
  [
    "OMG",
    "Oh My God",
    "English",
    "Internet & Social",
    "Expressa surpresa ou entusiasmo.",
    "oh my god",
    "WTH,WTF",
  ],
  [
    "WTF",
    "What The ...",
    "English",
    "Internet & Social",
    "Expressa surpresa ou indignação; expansão vulgar omitida.",
    "what the heck",
    "WTH,OMG",
  ],
  [
    "WTH",
    "What The Heck",
    "English",
    "Internet & Social",
    "Expressa surpresa ou confusão.",
    "what the heck",
    "WTF,OMG",
  ],
  [
    "FYI",
    "For Your Information",
    "English",
    "Internet & Social",
    "Para sua informação.",
    "for your information",
    "BTW,PSA",
  ],
  [
    "ASAP",
    "As Soon As Possible",
    "English",
    "Internet & Social",
    "O mais rápido possível.",
    "as soon as possible",
    "ETA",
  ],
  [
    "ETA",
    "Estimated Time of Arrival",
    "English",
    "Travel & Geography",
    "Horário estimado de chegada.",
    "estimated time of arrival",
    "ETD",
  ],
  ["IRL", "In Real Life", "English", "Internet & Social", "Na vida real.", "in real life", "AFK"],
  [
    "DM",
    "Direct Message",
    "English",
    "Internet & Social",
    "Mensagem direta/privada.",
    "direct message",
    "PM",
  ],
  [
    "PM",
    "Private Message",
    "English",
    "Internet & Social",
    "Mensagem privada.",
    "private message",
    "DM",
  ],
  [
    "FAQ",
    "Frequently Asked Questions",
    "English",
    "Internet & Social",
    "Perguntas frequentes.",
    "frequently asked questions",
    "Q&A",
  ],
  [
    "FOMO",
    "Fear Of Missing Out",
    "English",
    "Internet & Social",
    "Medo de perder uma experiência.",
    "fear of missing out",
    "JOMO",
  ],
  [
    "JOMO",
    "Joy Of Missing Out",
    "English",
    "Internet & Social",
    "Satisfação em não participar.",
    "joy of missing out",
    "FOMO",
  ],
  [
    "YOLO",
    "You Only Live Once",
    "English",
    "Internet & Social",
    "Só se vive uma vez.",
    "you only live once",
    "",
  ],
  [
    "POV",
    "Point Of View",
    "English",
    "Internet & Social",
    "Ponto de vista; comum em vídeos curtos.",
    "point of view",
    "FYP",
  ],
  [
    "FYP",
    "For You Page",
    "English",
    "Internet & Social",
    "Página de recomendações personalizada.",
    "for you page",
    "POV",
  ],
  [
    "TBT",
    "Throwback Thursday",
    "English",
    "Internet & Social",
    "Hashtag para recordar o passado.",
    "throwback thursday",
    "FBF",
  ],
  [
    "GRWM",
    "Get Ready With Me",
    "English",
    "Internet & Social",
    "Formato de vídeo de preparação pessoal.",
    "get ready with me",
    "OOTD",
  ],
  [
    "OOTD",
    "Outfit Of The Day",
    "English",
    "Internet & Social",
    "Look do dia.",
    "outfit of the day",
    "GRWM",
  ],
  [
    "AMA",
    "Ask Me Anything",
    "English",
    "Internet & Social",
    "Formato aberto de perguntas e respostas.",
    "ask me anything",
    "Q&A",
  ],
  [
    "NSFW",
    "Not Safe For Work",
    "English",
    "Internet & Social",
    "Aviso para conteúdo impróprio em ambiente profissional.",
    "not safe for work",
    "SFW",
  ],
  [
    "SFW",
    "Safe For Work",
    "English",
    "Internet & Social",
    "Conteúdo geralmente apropriado para ambiente profissional.",
    "safe for work",
    "NSFW",
  ],
  [
    "TLDR",
    "Too Long; Didn't Read",
    "English",
    "Internet & Social",
    "Resumo curto ou comentário sobre texto longo.",
    "too long didnt read",
    "FYI",
  ],
  [
    "IYKYK",
    "If You Know, You Know",
    "English",
    "Internet & Social",
    "Referência compreendida por quem conhece o contexto.",
    "if you know you know",
    "",
  ],
  ["FR", "For Real", "English", "Internet & Social", "De verdade.", "for real", "NGL,TBH"],
  ["RN", "Right Now", "English", "Internet & Social", "Agora mesmo.", "right now", "ASAP"],
  ["OMW", "On My Way", "English", "Internet & Social", "Estou a caminho.", "on my way", "ETA"],
  ["GTG", "Got To Go", "English", "Internet & Social", "Preciso ir.", "got to go", "BRB"],
  [
    "BBL",
    "Be Back Later",
    "English",
    "Internet & Social",
    "Volto mais tarde.",
    "be back later",
    "BRB",
  ],
  [
    "AFAIK",
    "As Far As I Know",
    "English",
    "Internet & Social",
    "Até onde eu sei.",
    "as far as i know",
    "IMO",
  ],
  [
    "ICYMI",
    "In Case You Missed It",
    "English",
    "Internet & Social",
    "Caso você não tenha visto.",
    "in case you missed it",
    "FYI",
  ],
  [
    "DIY",
    "Do It Yourself",
    "English",
    "Internet & Social",
    "Faça você mesmo.",
    "do it yourself",
    "",
  ],
  [
    "ELI5",
    "Explain Like I'm Five",
    "English",
    "Internet & Social",
    "Pedido de explicação simples.",
    "explain like im five",
    "TLDR",
  ],
  [
    "TIL",
    "Today I Learned",
    "English",
    "Internet & Social",
    "Hoje eu aprendi.",
    "today i learned",
    "ICYMI",
  ],
  [
    "SMH",
    "Shaking My Head",
    "English",
    "Internet & Social",
    "Expressa desaprovação ou incredulidade.",
    "shaking my head",
    "",
  ],
  [
    "TTYL",
    "Talk To You Later",
    "English",
    "Internet & Social",
    "Falo com você mais tarde.",
    "talk to you later",
    "GTG",
  ],
  ["LMK", "Let Me Know", "English", "Internet & Social", "Me avise.", "let me know", "FYI"],
  ["TY", "Thank You", "English", "Internet & Social", "Obrigado.", "thank you", "THX,TYSM"],
  [
    "THX",
    "Thanks",
    "English",
    "Internet & Social",
    "Obrigado; forma curta de thanks.",
    "thanks",
    "TY",
  ],
  [
    "TYSM",
    "Thank You So Much",
    "English",
    "Internet & Social",
    "Muito obrigado.",
    "thank you so much",
    "TY",
  ],
  ["NP", "No Problem", "English", "Internet & Social", "Sem problema.", "no problem", "YW"],
  ["YW", "You're Welcome", "English", "Internet & Social", "De nada.", "you are welcome", "NP"],
  ["NVM", "Never Mind", "English", "Internet & Social", "Deixa pra lá.", "never mind", ""],
  [
    "WYD",
    "What You Doing?",
    "English",
    "Internet & Social",
    "O que você está fazendo?",
    "what are you doing",
    "WYA",
  ],
  [
    "WYA",
    "Where You At?",
    "English",
    "Internet & Social",
    "Onde você está?",
    "where are you",
    "WYD",
  ],
  [
    "PFP",
    "Profile Picture",
    "English",
    "Internet & Social",
    "Imagem de perfil.",
    "profile picture",
    "DP",
  ],
  [
    "DP",
    "Display Picture",
    "English",
    "Internet & Social",
    "Imagem de perfil em alguns serviços.",
    "display picture",
    "PFP",
  ],
  [
    "GG",
    "Good Game",
    "English",
    "Gaming & Esports",
    "Expressão usada ao final de uma partida.",
    "good game",
    "WP,GLHF",
  ],
  [
    "WP",
    "Well Played",
    "English",
    "Gaming & Esports",
    "Reconhecimento por uma boa jogada.",
    "well played",
    "GG,GLHF",
  ],
  [
    "GLHF",
    "Good Luck, Have Fun",
    "English",
    "Gaming & Esports",
    "Boa sorte e divirta-se.",
    "good luck have fun",
    "GG,WP",
  ],
  [
    "AFK",
    "Away From Keyboard",
    "English",
    "Gaming & Esports",
    "Ausente do teclado.",
    "away from keyboard",
    "BRB,IRL",
  ],
  [
    "OP",
    "Overpowered",
    "English",
    "Gaming & Esports",
    "Algo considerado forte demais; também significa original poster.",
    "overpowered original poster",
    "NPC",
  ],
  [
    "NPC",
    "Non-Player Character",
    "English",
    "Gaming & Esports",
    "Personagem controlado pelo jogo.",
    "non player character",
    "RPG,AI",
  ],
  [
    "RPG",
    "Role-Playing Game",
    "English",
    "Gaming & Esports",
    "Jogo de interpretação de papéis.",
    "role playing game",
    "MMORPG,JRPG",
  ],
  [
    "MMORPG",
    "Massively Multiplayer Online Role-Playing Game",
    "English",
    "Gaming & Esports",
    "RPG online para muitos jogadores.",
    "massively multiplayer online role playing game",
    "RPG,MMO",
  ],
  [
    "FPS",
    "First-Person Shooter",
    "English",
    "Gaming & Esports",
    "Jogo de tiro em primeira pessoa; também frames per second.",
    "first person shooter",
    "TPS,Hz",
  ],
  [
    "TPS",
    "Third-Person Shooter",
    "English",
    "Gaming & Esports",
    "Jogo de tiro em terceira pessoa.",
    "third person shooter",
    "FPS",
  ],
  [
    "DLC",
    "Downloadable Content",
    "English",
    "Gaming & Esports",
    "Conteúdo adicional distribuído digitalmente.",
    "downloadable content",
    "",
  ],
  [
    "PVP",
    "Player Versus Player",
    "English",
    "Gaming & Esports",
    "Modo entre jogadores.",
    "player versus player",
    "PVE",
  ],
  [
    "PVE",
    "Player Versus Environment",
    "English",
    "Gaming & Esports",
    "Modo contra inimigos controlados pelo jogo.",
    "player versus environment",
    "PVP",
  ],
  [
    "MOBA",
    "Multiplayer Online Battle Arena",
    "English",
    "Gaming & Esports",
    "Gênero de arena online por equipes.",
    "multiplayer online battle arena",
    "RTS",
  ],
  [
    "XP",
    "Experience Points",
    "English",
    "Gaming & Esports",
    "Pontos de experiência.",
    "experience points",
    "HP,MP",
  ],
  [
    "HP",
    "Health Points",
    "English",
    "Gaming & Esports",
    "Pontos de vida.",
    "health points hit points",
    "MP,XP",
  ],
  [
    "MVP",
    "Most Valuable Player",
    "English",
    "Gaming & Esports",
    "Jogador mais valioso.",
    "most valuable player",
    "GOAT",
  ],
  [
    "MVP",
    "Minimum Viable Product",
    "English",
    "Finance & Business",
    "Produto mínimo viável; significado distinto de Most Valuable Player.",
    "minimum viable product",
    "POC",
  ],
  [
    "GOAT",
    "Greatest Of All Time",
    "English",
    "Gaming & Esports",
    "Melhor de todos os tempos.",
    "greatest of all time",
    "MVP",
  ],
  ["GL", "Good Luck", "English", "Gaming & Esports", "Boa sorte.", "good luck", "GLHF"],
  ["HF", "Have Fun", "English", "Gaming & Esports", "Divirta-se.", "have fun", "GLHF"],
  [
    "DPS",
    "Damage Per Second",
    "English",
    "Gaming & Esports",
    "Dano por segundo.",
    "damage per second",
    "HPS",
  ],
  [
    "AOE",
    "Area Of Effect",
    "English",
    "Gaming & Esports",
    "Efeito que atinge uma área.",
    "area of effect",
    "DPS",
  ],
  [
    "MMO",
    "Massively Multiplayer Online",
    "English",
    "Gaming & Esports",
    "Ambiente online para muitos jogadores.",
    "massively multiplayer online",
    "MMORPG",
  ],
  [
    "DNA",
    "Deoxyribonucleic Acid",
    "English",
    "Science & Education",
    "Ácido desoxirribonucleico.",
    "deoxyribonucleic acid",
    "RNA",
  ],
  [
    "RNA",
    "Ribonucleic Acid",
    "English",
    "Science & Education",
    "Ácido ribonucleico.",
    "ribonucleic acid",
    "DNA,mRNA",
  ],
  [
    "ATP",
    "Adenosine Triphosphate",
    "English",
    "Science & Education",
    "Molécula que transporta energia celular.",
    "adenosine triphosphate",
    "ADP",
  ],
  [
    "MRI",
    "Magnetic Resonance Imaging",
    "English",
    "Health",
    "Imagem por ressonância magnética.",
    "magnetic resonance imaging",
    "CT",
  ],
  [
    "CT",
    "Computed Tomography",
    "English",
    "Health",
    "Tomografia computadorizada; também tem outros sentidos.",
    "computed tomography",
    "MRI",
  ],
  [
    "ICU",
    "Intensive Care Unit",
    "English",
    "Health",
    "Unidade de terapia intensiva.",
    "intensive care unit",
    "ER",
  ],
  ["ER", "Emergency Room", "English", "Health", "Pronto-socorro.", "emergency room", "ICU"],
  [
    "WHO",
    "World Health Organization",
    "English",
    "Health",
    "Organização Mundial da Saúde.",
    "oms",
    "OMS",
  ],
  [
    "OMS",
    "Organização Mundial da Saúde",
    "Portuguese",
    "Health",
    "Agência especializada das Nações Unidas para saúde.",
    "who",
    "WHO",
  ],
  [
    "PhD",
    "Doctor of Philosophy",
    "English",
    "Science & Education",
    "Grau acadêmico de doutorado.",
    "doctor of philosophy",
    "MSc,BA",
  ],
  [
    "MSc",
    "Master of Science",
    "English",
    "Science & Education",
    "Grau acadêmico de mestrado em ciências.",
    "master of science",
    "PhD",
  ],
  [
    "GPA",
    "Grade Point Average",
    "English",
    "Science & Education",
    "Média de notas em sistemas educacionais que usam GPA.",
    "grade point average",
    "CGPA",
  ],
  [
    "DJ",
    "Disc Jockey",
    "English",
    "Entertainment",
    "Pessoa que seleciona e mixa música.",
    "disc jockey",
    "EDM,MC",
  ],
  [
    "EDM",
    "Electronic Dance Music",
    "English",
    "Entertainment",
    "Música eletrônica de dança.",
    "electronic dance music",
    "DJ",
  ],
  [
    "EP",
    "Extended Play",
    "English",
    "Entertainment",
    "Lançamento musical entre single e álbum em duração.",
    "extended play",
    "LP",
  ],
  [
    "LP",
    "Long Play",
    "English",
    "Entertainment",
    "Disco de longa duração; álbum em vinil.",
    "long play",
    "EP",
  ],
  [
    "OST",
    "Original Soundtrack",
    "English",
    "Entertainment",
    "Trilha sonora original.",
    "original soundtrack",
    "BGM",
  ],
  [
    "BGM",
    "Background Music",
    "English",
    "Entertainment",
    "Música de fundo.",
    "background music",
    "OST",
  ],
  [
    "OTT",
    "Over-The-Top",
    "English",
    "Entertainment",
    "Distribuição de conteúdo pela internet.",
    "over the top streaming",
    "VOD",
  ],
  [
    "VOD",
    "Video On Demand",
    "English",
    "Entertainment",
    "Vídeo sob demanda.",
    "video on demand",
    "OTT",
  ],
  [
    "GPS",
    "Global Positioning System",
    "English",
    "Travel & Geography",
    "Sistema de posicionamento por satélite.",
    "global positioning system",
    "GNSS",
  ],
  [
    "UN",
    "United Nations",
    "English",
    "Travel & Geography",
    "Organização das Nações Unidas.",
    "onu",
    "ONU",
  ],
  [
    "ONU",
    "Organização das Nações Unidas",
    "Portuguese",
    "Travel & Geography",
    "Nome em português das Nações Unidas.",
    "united nations",
    "UN",
  ],
  [
    "BFF",
    "Best Friends Forever",
    "English",
    "Relationships",
    "Melhores amigos para sempre.",
    "best friends forever",
    "ILY",
  ],
  ["ILY", "I Love You", "English", "Relationships", "Eu te amo.", "i love you", "ILU,XOXO"],
  [
    "XOXO",
    "Hugs and Kisses",
    "English",
    "Relationships",
    "Beijos e abraços ao final de mensagem.",
    "hugs kisses",
    "ILY",
  ],
  [
    "BF",
    "Boyfriend",
    "English",
    "Relationships",
    "Namorado; pode ter outros sentidos conforme contexto.",
    "boyfriend",
    "GF",
  ],
  [
    "GF",
    "Girlfriend",
    "English",
    "Relationships",
    "Namorada; pode ter outros sentidos conforme contexto.",
    "girlfriend",
    "BF",
  ],
  [
    "SO",
    "Significant Other",
    "English",
    "Relationships",
    "Parceiro ou parceira.",
    "significant other",
    "BF,GF",
  ],
  [
    "TMJ",
    "Tamo Junto",
    "Portuguese",
    "Portuguese Slang",
    "Expressão brasileira de apoio ou parceria.",
    "tamo junto",
    "vlw,blz",
  ],
  ["VC", "Você", "Portuguese", "Portuguese Slang", "Abreviação informal de você.", "voce", "cê,pq"],
  [
    "PQ",
    "Porque / Por que",
    "Portuguese",
    "Portuguese Slang",
    "Abreviação informal; sentido depende da frase.",
    "porque por que",
    "vc,q",
  ],
  [
    "BLZ",
    "Beleza",
    "Portuguese",
    "Portuguese Slang",
    "Pode significar tudo bem, certo ou beleza.",
    "beleza",
    "tmj",
  ],
  [
    "FLW",
    "Falou",
    "Portuguese",
    "Portuguese Slang",
    "Despedida informal brasileira.",
    "falou",
    "vlw,tmj",
  ],
  [
    "VLW",
    "Valeu",
    "Portuguese",
    "Portuguese Slang",
    "Agradecimento ou despedida informal.",
    "valeu",
    "obg,flw",
  ],
  [
    "OBG",
    "Obrigado(a)",
    "Portuguese",
    "Portuguese Slang",
    "Abreviação de agradecimento.",
    "obrigado obrigada",
    "vlw",
  ],
  [
    "SLC",
    "Cê é louco",
    "Portuguese",
    "Portuguese Slang",
    "Gíria brasileira de surpresa; uso regional.",
    "ce e louco",
    "mds",
  ],
  [
    "MDs",
    "Meu Deus",
    "Portuguese",
    "Portuguese Slang",
    "Expressa surpresa ou espanto.",
    "meu deus",
    "omg",
  ],
  [
    "RSVP",
    "Répondez s'il vous plaît",
    "French",
    "French",
    "Pedido de confirmação de presença.",
    "please respond",
    "",
  ],
  [
    "MDR",
    "Mort de rire",
    "French",
    "French",
    "Expressão francesa equivalente a rir muito.",
    "laughing",
    "PTDR",
  ],
  [
    "PTDR",
    "Pété de rire",
    "French",
    "French",
    "Gíria francesa para rir muito.",
    "bursting with laughter",
    "MDR",
  ],
  [
    "JPP",
    "J'en peux plus",
    "French",
    "French",
    "Gíria francesa: não aguento mais.",
    "i cant take it anymore",
    "MDR",
  ],
  [
    "MfG",
    "Mit freundlichen Grüßen",
    "German",
    "German",
    "Fecho formal de mensagem em alemão.",
    "kind regards",
    "LG",
  ],
  [
    "LG",
    "Liebe Grüße",
    "German",
    "German",
    "Fecho informal de mensagem em alemão.",
    "kind regards",
    "VG",
  ],
  [
    "VG",
    "Viele Grüße",
    "German",
    "German",
    "Muitas saudações; fecho de mensagem.",
    "best regards",
    "LG",
  ],
  [
    "ㅋㅋㅋ",
    "Korean laughter",
    "Korean",
    "Japanese & Korean",
    "Sequência coreana que representa risada.",
    "korean laughter",
    "ㅎㅎㅎ",
  ],
  [
    "ㅎㅎㅎ",
    "Korean soft laughter",
    "Korean",
    "Japanese & Korean",
    "Sequência coreana para risada leve.",
    "korean laugh",
    "ㅋㅋㅋ",
  ],
  [
    "草",
    "Kusa / laughter",
    "Japanese",
    "Japanese & Korean",
    "Gíria japonesa de internet para rir.",
    "kusa laugh",
    "www,w",
  ],
  [
    "www",
    "Warai / laughter",
    "Japanese",
    "Japanese & Korean",
    "Sequência de w usada para representar risada em japonês online.",
    "warai laugh",
    "草",
  ],
  [
    "おつ",
    "Otsukare",
    "Japanese",
    "Japanese & Korean",
    "Forma curta para reconhecer esforço ou dizer bom trabalho.",
    "good work",
    "乙",
  ],
  [
    "乙",
    "Otsukare",
    "Japanese",
    "Japanese & Korean",
    "Caractere usado como abreviação visual de otsukare em chats.",
    "good work",
    "おつ",
  ],
  [
    "AKA",
    "Also Known As",
    "English",
    "General English",
    "Também conhecido como.",
    "also known as",
    "a.k.a.",
  ],
  [
    "DOB",
    "Date Of Birth",
    "English",
    "General English",
    "Data de nascimento.",
    "date of birth",
    "POB",
  ],
  [
    "POB",
    "Place Of Birth",
    "English",
    "General English",
    "Local de nascimento.",
    "place of birth",
    "DOB",
  ],
  ["RIP", "Rest In Peace", "English", "General English", "Descanse em paz.", "rest in peace", ""],
  [
    "VIP",
    "Very Important Person",
    "English",
    "General English",
    "Pessoa muito importante.",
    "very important person",
    "CEO",
  ],
  [
    "PIN",
    "Personal Identification Number",
    "English",
    "Security & Privacy",
    "Número de identificação pessoal.",
    "personal identification number",
    "OTP",
  ],
  [
    "ID",
    "Identification",
    "English",
    "General English",
    "Identificação; também pode significar identifier.",
    "identification",
    "UID",
  ],
  [
    "UID",
    "Unique Identifier",
    "English",
    "Technology",
    "Identificador único.",
    "unique identifier",
    "ID",
  ],
  [
    "TBA",
    "To Be Announced",
    "English",
    "General English",
    "A ser anunciado.",
    "to be announced",
    "TBD",
  ],
  [
    "TBD",
    "To Be Determined",
    "English",
    "General English",
    "A ser definido.",
    "to be determined",
    "TBA",
  ],
  [
    "TBC",
    "To Be Confirmed",
    "English",
    "General English",
    "A confirmar.",
    "to be confirmed",
    "TBD",
  ],
  [
    "N/A",
    "Not Applicable / Not Available",
    "English",
    "General English",
    "Não aplicável ou não disponível conforme contexto.",
    "not applicable not available",
    "TBD",
  ],
  ["e.g.", "Exempli gratia", "Latin", "General English", "Por exemplo.", "for example", "i.e."],
  ["i.e.", "Id est", "Latin", "General English", "Isto é; ou seja.", "that is", "e.g."],
  [
    "etc.",
    "Et cetera",
    "Latin",
    "General English",
    "E outras coisas do mesmo tipo.",
    "and so on",
    "",
  ],
  ["vs.", "Versus", "Latin", "General English", "Em oposição ou comparação com.", "against", ""],
  [
    "TBA",
    "To Be Announced",
    "English",
    "General English",
    "A ser anunciado; também aparece em agendas e eventos.",
    "to be announced",
    "TBD",
  ],
  [
    "TQM",
    "Te Quiero Mucho",
    "Spanish",
    "Spanish Slang",
    "Expressão espanhola: gosto muito de você.",
    "te quiero mucho",
    "TQ",
  ],
  [
    "XQ",
    "Por qué / porque",
    "Spanish",
    "Spanish Slang",
    "Abreviação informal de porque/por qué.",
    "porque por que",
    "pq",
  ],
  [
    "XFA",
    "Por favor",
    "Spanish",
    "Spanish Slang",
    "Abreviação informal de por favor.",
    "por favor",
    "pls",
  ],
  [
    "DND",
    "Dónde",
    "Spanish",
    "Spanish Slang",
    "Abreviação informal de dónde em mensagens.",
    "where",
    "",
  ],
  [
    "CMQ",
    "Comunque",
    "Italian",
    "Italian",
    "Abreviação italiana de comunque (de qualquer forma).",
    "comunque",
    "",
  ],
  [
    "TVB",
    "Ti Voglio Bene",
    "Italian",
    "Italian",
    "Expressão italiana de carinho: gosto muito de você.",
    "ti voglio bene",
    "ILY",
  ],
  ["XKE", "Perché", "Italian", "Italian", "Grafia abreviada informal de perché.", "perche", ""],
  ["NN", "Non", "Italian", "Italian", "Abreviação informal de non em mensagens.", "not", ""],
  [
    "666",
    "Liu Liu Liu",
    "Chinese",
    "Chinese",
    "Gíria online chinesa para algo excelente ou habilidoso; associada a 溜.",
    "awesome skilled",
    "",
  ],
  [
    "88",
    "Bye-bye",
    "Chinese",
    "Chinese",
    "Despedida em chats chineses por aproximação sonora com 拜拜.",
    "bye bye",
    "886",
  ],
  [
    "520",
    "Wo Ai Ni",
    "Chinese",
    "Chinese",
    "Código numérico usado como declaração de amor em mandarim.",
    "i love you",
    "1314",
  ],
  [
    "спс",
    "Спасибо (Spasibo)",
    "Russian",
    "Russian",
    "Abreviação informal russa de obrigado.",
    "thank you",
    "пж",
  ],
  [
    "лол",
    "Лол (LOL)",
    "Russian",
    "Russian",
    "Transliteração cirílica comum de LOL em chats russos.",
    "laughing out loud",
    "LOL",
  ],
  [
    "пж",
    "Пожалуйста (Pozhaluysta)",
    "Russian",
    "Russian",
    "Abreviação informal russa de por favor.",
    "please",
    "спс",
  ],
];
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const SEED: AbbreviationRecord[] = rows
  .map(
    ([
      abbreviation,
      meaning,
      language,
      category,
      description = "",
      aliases = "",
      related = "",
    ]) => ({
      id: `${norm(abbreviation).replace(/[^a-z0-9]+/g, "-")}-${norm(meaning)
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 36)}`,
      abbreviation,
      meaning,
      language,
      category,
      description,
      aliases: aliases
        .split(/[,;]/)
        .map((v) => v.trim())
        .filter(Boolean),
      related: related
        .split(/[,;]/)
        .map((v) => v.trim())
        .filter(Boolean),
      sourceNote:
        "Registro editorial inicial. Siglas podem ter significados diferentes conforme idioma e contexto.",
    }),
  )
  .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
  .map((r): AbbreviationRecord => ({
    ...r,
    region: "Global",
    kind: "popular",
    verified: false,
    packId: "editorial-seed",
  }));

/**
 * Data packs: every JSON file in src/data/abbreviations is picked up automatically,
 * so the library grows by adding or regenerating files (see scripts/build-abbreviation-packs.py),
 * not by editing this module. Row: [abbr, meaning, language, category, region, kind, description, aliases].
 */
export interface AbbreviationPackFile {
  id: string;
  name: string;
  source: string;
  sourceUrl: string;
  verified: boolean;
  rows: Array<[string, string, string, string, string, string, string, string]>;
}
export interface AbbreviationPackInfo {
  id: string;
  name: string;
  source: string;
  sourceUrl: string;
  verified: boolean;
  count: number;
}
const packFiles = Object.values(
  import.meta.glob<AbbreviationPackFile>("../../data/abbreviations/*.json", {
    eager: true,
    import: "default",
  }),
).sort((a, b) => a.id.localeCompare(b.id));
const KINDS = new Set(Object.keys(ABBREVIATION_KINDS));
const slug = (s: string) =>
  norm(s)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
const SEED_PACK: AbbreviationPackInfo = {
  id: "editorial-seed",
  name: "Seleção editorial inicial",
  source: "Curadoria editorial do DRUG URL",
  sourceUrl: "",
  verified: false,
  count: SEED.length,
};
const seenKeys = new Set(SEED.map((r) => `${norm(r.abbreviation)}|${norm(r.meaning)}`));
const packRecords: AbbreviationRecord[] = [];
export const ABBREVIATION_PACKS: AbbreviationPackInfo[] = [SEED_PACK];
for (const pack of packFiles) {
  let count = 0;
  for (const [
    abbreviation,
    meaning,
    language,
    category,
    region,
    kind,
    description,
    aliases,
  ] of pack.rows) {
    const key = `${norm(abbreviation)}|${norm(meaning)}`;
    if (!abbreviation || !meaning || seenKeys.has(key)) continue; // same sense already present; different senses are kept
    seenKeys.add(key);
    count++;
    packRecords.push({
      id: `${pack.id}:${slug(abbreviation)}:${slug(meaning)}`,
      abbreviation,
      meaning,
      language,
      category: category as AbbreviationCategory,
      description,
      aliases: aliases
        ? aliases
            .split(/[,;]/)
            .map((v) => v.trim())
            .filter(Boolean)
        : [],
      related: [],
      sourceNote: pack.verified
        ? `Fonte: ${pack.source}.`
        : `${pack.source}. Registro não verificado individualmente.`,
      region: region || "Global",
      kind: (KINDS.has(kind) ? kind : "popular") as AbbreviationKind,
      verified: pack.verified,
      ...(pack.sourceUrl ? { sourceUrl: pack.sourceUrl } : {}),
      packId: pack.id,
    });
  }
  ABBREVIATION_PACKS.push({
    id: pack.id,
    name: pack.name,
    source: pack.source,
    sourceUrl: pack.sourceUrl,
    verified: pack.verified,
    count,
  });
}
export const BUILT_IN_ABBREVIATIONS: AbbreviationRecord[] = [...SEED, ...packRecords];

/** Groups records by normalized abbreviation so every known meaning can be shown together. */
export function groupMeanings(records: AbbreviationRecord[]): Map<string, AbbreviationRecord[]> {
  const map = new Map<string, AbbreviationRecord[]>();
  for (const r of records) {
    const k = norm(r.abbreviation);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}
export interface AbbreviationCollection {
  id: string;
  name: string;
  recordIds: string[];
}
export interface AbbreviationUserData {
  custom: AbbreviationRecord[];
  favorites: string[];
  recent: string[];
  collections: AbbreviationCollection[];
}
export const EMPTY_ABBREVIATION_USER_DATA: AbbreviationUserData = {
  custom: [],
  favorites: [],
  recent: [],
  collections: [],
};
export const MAX_CUSTOM_ABBREVIATIONS = 50000;
export const ABBREVIATION_STORAGE_KEY = "drug-url:abbreviations:v1";
export function searchAbbreviations(
  query: string,
  records = BUILT_IN_ABBREVIATIONS,
): AbbreviationRecord[] {
  const q = norm(query);
  if (!q) return records;
  const terms = q.split(/\s+/).filter(Boolean);
  return records.filter((r) => {
    const categoryTerms =
      r.category === "Crypto & Blockchain" ? "cryptocurrency crypto blockchain digital asset" : "";
    const haystack = norm(
      [
        r.abbreviation,
        r.meaning,
        r.language,
        r.category,
        r.region ?? "",
        categoryTerms,
        r.description,
        ...r.aliases,
        ...r.related,
      ].join(" "),
    );
    return terms.every((term) => haystack.includes(term));
  });
}
export function mergeAbbreviationUserData(
  current: AbbreviationUserData,
  incoming: AbbreviationUserData,
): AbbreviationUserData {
  const byKey = new Map<string, AbbreviationRecord>();
  for (const r of [...current.custom, ...incoming.custom]) {
    const key = `${norm(r.abbreviation)}|${norm(r.meaning)}`;
    if (!byKey.has(key)) byKey.set(key, r);
  }
  const collections = new Map(current.collections.map((c) => [c.id, c]));
  for (const c of incoming.collections) {
    const old = collections.get(c.id);
    collections.set(
      c.id,
      old ? { ...old, recordIds: [...new Set([...old.recordIds, ...c.recordIds])] } : c,
    );
  }
  return {
    custom: [...byKey.values()],
    favorites: [...new Set([...current.favorites, ...incoming.favorites])],
    recent: [...new Set([...current.recent, ...incoming.recent])].slice(0, 30),
    collections: [...collections.values()],
  };
}
export function normalizeAbbreviationUserData(value: unknown): AbbreviationUserData {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return EMPTY_ABBREVIATION_USER_DATA;
  const raw = value as Partial<AbbreviationUserData>;
  const source = Array.isArray(raw.custom) ? raw.custom : [];
  const byKey = new Map<string, AbbreviationRecord>();
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const x = item as Partial<AbbreviationRecord>;
    if (
      typeof x.id !== "string" ||
      typeof x.abbreviation !== "string" ||
      typeof x.meaning !== "string" ||
      typeof x.language !== "string" ||
      typeof x.category !== "string" ||
      !Array.isArray(x.aliases) ||
      !Array.isArray(x.related) ||
      x.abbreviation.length > 40 ||
      x.meaning.length > 300
    )
      continue;
    const record: AbbreviationRecord = {
      id: x.id.slice(0, 160),
      abbreviation: x.abbreviation.trim(),
      meaning: x.meaning.trim(),
      language: x.language.slice(0, 40),
      category: x.category as AbbreviationCategory,
      description: typeof x.description === "string" ? x.description.slice(0, 1000) : "",
      aliases: x.aliases.filter((v): v is string => typeof v === "string").slice(0, 30),
      related: x.related.filter((v): v is string => typeof v === "string").slice(0, 30),
      sourceNote:
        typeof x.sourceNote === "string" ? x.sourceNote.slice(0, 500) : "Registro personalizado.",
      ...(typeof x.region === "string" && x.region ? { region: x.region.slice(0, 60) } : {}),
      ...(typeof x.kind === "string" && x.kind in ABBREVIATION_KINDS ? { kind: x.kind } : {}),
      ...(typeof x.sourceUrl === "string" && /^https?:\/\//.test(x.sourceUrl)
        ? { sourceUrl: x.sourceUrl.slice(0, 300) }
        : {}),
    };
    if (!record.abbreviation || !record.meaning) continue;
    const key = `${norm(record.abbreviation)}|${norm(record.meaning)}`;
    if (!byKey.has(key)) byKey.set(key, record);
    if (byKey.size >= MAX_CUSTOM_ABBREVIATIONS) break;
  }
  const collections = Array.isArray(raw.collections)
    ? raw.collections
        .filter(
          (c) =>
            !!c &&
            typeof c === "object" &&
            typeof c.id === "string" &&
            typeof c.name === "string" &&
            Array.isArray(c.recordIds),
        )
        .map((c) => ({
          id: c.id.slice(0, 120),
          name: c.name.slice(0, 60),
          recordIds: [
            ...new Set(c.recordIds.filter((x): x is string => typeof x === "string")),
          ].slice(0, 10000),
        }))
        .slice(0, 100)
    : [];
  return {
    custom: [...byKey.values()],
    favorites: Array.isArray(raw.favorites)
      ? [...new Set(raw.favorites.filter((x): x is string => typeof x === "string"))].slice(
          0,
          20000,
        )
      : [],
    recent: Array.isArray(raw.recent)
      ? [...new Set(raw.recent.filter((x): x is string => typeof x === "string"))].slice(0, 30)
      : [],
    collections,
  };
}
export function findMatchingAbbreviationCodes(
  query: string,
  records: AbbreviationRecord[] = BUILT_IN_ABBREVIATIONS,
): Set<string> {
  const q = norm(query);
  if (!q) return new Set();
  const terms = q.split(/\s+/).filter(Boolean);
  return new Set(
    records
      .filter((r) => {
        const categoryTerms =
          r.category === "Crypto & Blockchain"
            ? "cryptocurrency crypto blockchain digital asset"
            : "";
        const haystack = norm(
          [
            r.meaning,
            r.description,
            r.language,
            r.category,
            categoryTerms,
            ...r.aliases,
            ...r.related,
          ].join(" "),
        );
        return terms.every((term) => haystack.includes(term));
      })
      .map((r) => norm(r.abbreviation)),
  );
}
export function normalizeAbbreviationCode(value: string): string {
  return norm(value);
}
export function matchesAbbreviationMeaning(
  query: string,
  code: string,
  records: AbbreviationRecord[] = BUILT_IN_ABBREVIATIONS,
): boolean {
  return findMatchingAbbreviationCodes(query, records).has(norm(code));
}
