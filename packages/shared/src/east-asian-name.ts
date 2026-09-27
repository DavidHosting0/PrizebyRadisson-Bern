/**
 * Romanized Chinese, Japanese and Korean names.
 * Country is often missing on the arrival list, so "Yao Niu" must still stay off floor -1.
 */

const PINYIN = new Set<string>([
  'a', 'ai', 'an', 'ang', 'ao',
  'ba', 'bai', 'ban', 'bang', 'bao', 'bei', 'ben', 'beng', 'bi', 'bian', 'biao', 'bie', 'bin', 'bing', 'bo', 'bu',
  'ca', 'cai', 'can', 'cang', 'cao', 'ce', 'cen', 'ceng', 'cha', 'chai', 'chan', 'chang', 'chao', 'che', 'chen', 'cheng', 'chi', 'chong', 'chou', 'chu', 'chua', 'chuai', 'chuan', 'chuang', 'chui', 'chun', 'chuo', 'ci', 'cong', 'cou', 'cu', 'cuan', 'cui', 'cun', 'cuo',
  'da', 'dai', 'dan', 'dang', 'dao', 'de', 'dei', 'den', 'deng', 'di', 'dia', 'dian', 'diao', 'die', 'ding', 'diu', 'dong', 'dou', 'du', 'duan', 'dui', 'dun', 'duo',
  'e', 'ei', 'en', 'eng', 'er',
  'fa', 'fan', 'fang', 'fei', 'fen', 'feng', 'fo', 'fou', 'fu',
  'ga', 'gai', 'gan', 'gang', 'gao', 'ge', 'gei', 'gen', 'geng', 'gong', 'gou', 'gu', 'gua', 'guai', 'guan', 'guang', 'gui', 'gun', 'guo',
  'ha', 'hai', 'han', 'hang', 'hao', 'he', 'hei', 'hen', 'heng', 'hong', 'hou', 'hu', 'hua', 'huai', 'huan', 'huang', 'hui', 'hun', 'huo',
  'ji', 'jia', 'jian', 'jiang', 'jiao', 'jie', 'jin', 'jing', 'jiong', 'jiu', 'ju', 'juan', 'jue', 'jun',
  'ka', 'kai', 'kan', 'kang', 'kao', 'ke', 'ken', 'keng', 'kong', 'kou', 'ku', 'kua', 'kuai', 'kuan', 'kuang', 'kui', 'kun', 'kuo',
  'la', 'lai', 'lan', 'lang', 'lao', 'le', 'lei', 'leng', 'li', 'lia', 'lian', 'liang', 'liao', 'lie', 'lin', 'ling', 'liu', 'long', 'lou', 'lu', 'luan', 'lue', 'lun', 'luo', 'lv', 'lve',
  'ma', 'mai', 'man', 'mang', 'mao', 'me', 'mei', 'men', 'meng', 'mi', 'mian', 'miao', 'mie', 'min', 'ming', 'miu', 'mo', 'mou', 'mu',
  'na', 'nai', 'nan', 'nang', 'nao', 'ne', 'nei', 'nen', 'neng', 'ni', 'nian', 'niang', 'niao', 'nie', 'nin', 'ning', 'niu', 'nong', 'nou', 'nu', 'nuan', 'nue', 'nuo', 'nv', 'nve',
  'o', 'ou',
  'pa', 'pai', 'pan', 'pang', 'pao', 'pei', 'pen', 'peng', 'pi', 'pian', 'piao', 'pie', 'pin', 'ping', 'po', 'pou', 'pu',
  'qi', 'qia', 'qian', 'qiang', 'qiao', 'qie', 'qin', 'qing', 'qiong', 'qiu', 'qu', 'quan', 'que', 'qun',
  'ran', 'rang', 'rao', 're', 'ren', 'reng', 'ri', 'rong', 'rou', 'ru', 'rua', 'ruan', 'rui', 'run', 'ruo',
  'sa', 'sai', 'san', 'sang', 'sao', 'se', 'sen', 'seng', 'sha', 'shai', 'shan', 'shang', 'shao', 'she', 'shei', 'shen', 'sheng', 'shi', 'shou', 'shu', 'shua', 'shuai', 'shuan', 'shuang', 'shui', 'shun', 'shuo', 'si', 'song', 'sou', 'su', 'suan', 'sui', 'sun', 'suo',
  'ta', 'tai', 'tan', 'tang', 'tao', 'te', 'teng', 'ti', 'tian', 'tiao', 'tie', 'ting', 'tong', 'tou', 'tu', 'tuan', 'tui', 'tun', 'tuo',
  'wa', 'wai', 'wan', 'wang', 'wei', 'wen', 'weng', 'wo', 'wu',
  'xi', 'xia', 'xian', 'xiang', 'xiao', 'xie', 'xin', 'xing', 'xiong', 'xiu', 'xu', 'xuan', 'xue', 'xun',
  'ya', 'yan', 'yang', 'yao', 'ye', 'yi', 'yin', 'ying', 'yong', 'you', 'yu', 'yuan', 'yue', 'yun',
  'za', 'zai', 'zan', 'zang', 'zao', 'ze', 'zei', 'zen', 'zeng', 'zha', 'zhai', 'zhan', 'zhang', 'zhao', 'zhe', 'zhei', 'zhen', 'zheng', 'zhi', 'zhong', 'zhou', 'zhu', 'zhua', 'zhuai', 'zhuan', 'zhuang', 'zhui', 'zhun', 'zhuo', 'zi', 'zong', 'zou', 'zu', 'zuan', 'zui', 'zun', 'zuo',
]);

const EXTRA_SYLLABLES = [
  // Wade-Giles, postal and other passport spellings that are not Hanyu Pinyin.
  'chi', 'chia', 'chiang', 'chiao', 'chieh', 'chien', 'chih', 'chin', 'ching', 'chiu', 'chiung', 'cho', 'chou', 'chu', 'chuan', 'chung', 'chueh',
  'erh', 'hsia', 'hsiang', 'hsiao', 'hsieh', 'hsien', 'hsin', 'hsing', 'hsiu', 'hsiung', 'hsu', 'hsuan', 'hsueh', 'hsun',
  'jih', 'kuei', 'kuang', 'kung', 'kwo',
  'shih', 'ssu', 'szu',
  'tsai', 'tsan', 'tsang', 'tsao', 'tse', 'tsen', 'tseng', 'tso', 'tsou', 'tsu', 'tsui', 'tsun', 'tsung', 'tzu', 'tze',
  'yueh', 'yung',
  'lyu', 'nyu',
  // Cantonese spellings used in given names.
  'wing', 'wai', 'hoi', 'kit', 'kin', 'kuen', 'yuen', 'keung', 'kwong', 'cheong', 'cheuk', 'shing', 'hing', 'lok', 'fong', 'tsui', 'lui', 'mui', 'pui', 'chung', 'cheong',
];

const SYLLABLES = new Set<string>([...PINYIN, ...EXTRA_SYLLABLES]);
const SURNAMES = new Set<string>([
  'sato', 'suzuki', 'takahashi', 'tanaka', 'watanabe', 'ito', 'itoh', 'yamamoto', 'nakamura', 'kobayashi', 'kato', 'yoshida', 'yamada', 'sasaki', 'yamaguchi', 'matsumoto', 'inoue', 'kimura', 'hayashi', 'shimizu', 'yamazaki', 'saito', 'saitoh', 'fujita', 'ikeda', 'hashimoto', 'yamashita', 'ishikawa', 'nakajima', 'maeda', 'fujii', 'nishimura', 'fukuda', 'ota', 'miura', 'okamoto', 'matsuda', 'nakagawa', 'nakano', 'harada', 'ono', 'tamura', 'takeuchi', 'kaneko', 'wada', 'nakayama', 'ishida', 'ueda', 'morita', 'hara', 'shibata', 'sakai', 'kudo', 'yokoyama', 'miyazaki', 'miyamoto', 'uchida', 'takagi', 'ando', 'taniguchi', 'ohno', 'maruyama', 'imai', 'takada', 'fujiwara', 'takeda', 'murata', 'ueno', 'sugiyama', 'masuda', 'sugawara', 'hirano', 'kojima', 'otsuka', 'chiba', 'kubo', 'matsui', 'iwasaki', 'sakurai', 'kinoshita', 'noguchi', 'matsuo', 'nomura', 'kikuchi', 'sano', 'onishi', 'sugimoto', 'arai', 'ogawa', 'okada', 'hasegawa', 'murakami', 'kondo', 'ishii', 'sakamoto', 'abe', 'mori', 'goto', 'aoki', 'endo',
  'kim', 'lee', 'park', 'choi', 'jung', 'jeong', 'kang', 'cho', 'yoon', 'yun', 'jang', 'lim', 'han', 'oh', 'seo', 'shin', 'kwon', 'hwang', 'ahn', 'song', 'yoo', 'yu', 'hong', 'jeon', 'ko', 'moon', 'yang', 'son', 'bae', 'baek', 'heo', 'nam', 'sim', 'shim', 'noh', 'ha', 'kwak', 'sung', 'cha', 'joo', 'woo', 'goo', 'min', 'yeo', 'jin', 'ji', 'eom', 'won', 'bang', 'gong', 'hyun', 'byun', 'byon',
  'wong', 'cheung', 'leung', 'ng', 'lam', 'lau', 'yeung', 'chow', 'yip', 'kwok', 'kwan', 'tsang', 'hui', 'poon', 'siu', 'yau', 'chiu', 'fung', 'mak', 'ho', 'chan', 'tam',
  'hsiao', 'chiang', 'chou', 'tsao', 'tseng', 'hsu', 'hsueh', 'kwok',
  'nguyen', 'tran', 'pham', 'hoang', 'huynh', 'phan', 'vu', 'dang', 'bui', 'ngo', 'duong', 'truong', 'dinh',
  'wang', 'li', 'zhang', 'liu', 'chen', 'yang', 'huang', 'zhao', 'wu', 'zhou', 'xu', 'sun', 'ma', 'zhu', 'hu', 'guo', 'lin', 'gao', 'luo', 'zheng', 'liang', 'xie', 'tang', 'han', 'cao', 'deng', 'feng', 'peng', 'xiao', 'cai', 'pan', 'yuan', 'dong', 'ye', 'cheng', 'wei', 'su', 'jiang', 'ding', 'shen', 'yao', 'tan', 'cui', 'fan', 'fang', 'shi', 'hou', 'shao', 'meng', 'wan', 'duan', 'qian', 'yin', 'qiao', 'yan', 'lei', 'hao', 'kong', 'bai', 'qiu', 'qin', 'gu', 'niu', 'mao', 'xiong', 'jin', 'dai', 'xia', 'zhong', 'tian', 'du', 'ren', 'zeng', 'fu',
]);

const SKIP = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'herr', 'frau', 'prof', 'van', 'von', 'de', 'da', 'di', 'la', 'le', 'du']);

function nameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[,/;]+/g, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !SKIP.has(token));
}

function syllableCount(token: string): number {
  const n = token.length;
  const dp = new Array<number>(n + 1).fill(-1);
  dp[0] = 0;
  for (let i = 0; i < n; i++) {
    if (dp[i] < 0 || dp[i] >= 3) continue;
    for (let j = i + 1; j <= n; j++) {
      if (!SYLLABLES.has(token.slice(i, j))) continue;
      const next = dp[i] + 1;
      if (next <= 3 && (dp[j] < 0 || next < dp[j])) dp[j] = next;
    }
  }
  return dp[n] > 0 ? dp[n] : 0;
}

function isChineseToken(token: string): boolean {
  const parts = syllableCount(token);
  if (parts === 1) return true;
  if (parts === 2) return token.length >= 5;
  if (parts >= 3) return token.length >= 7;
  return false;
}

export function isEastAsianName(name: string | null | undefined): boolean {
  if (!name) return false;
  const tokens = nameTokens(name);
  if (!tokens.length) return false;
  if (tokens.some((token) => SURNAMES.has(token))) return true;
  if (tokens.length === 1) return syllableCount(tokens[0]) >= 2 && isChineseToken(tokens[0]);
  return tokens.every((token) => isChineseToken(token));
}
