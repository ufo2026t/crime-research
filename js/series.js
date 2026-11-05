/*
 * 事件ファイル（シリーズ）の登録簿
 * シリーズ選択ページ（index.html）とゲーム画面（game.html）の両方から読み込む。
 *   files    … game.html が読み込むシリーズ固有のデータ
 *   ruby     … ふりがなを付ける固有名詞 [正規表現, 読み]。長い語を先に置く
 *   art      … タイトル画面・カード・序章の背景に使う建物のシルエット
 */
(function () {
  'use strict';

  const MANSION = `<svg class="mansion" viewBox="0 0 800 300" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <path d="M-800 232 Q-400 214 0 236 Q120 206 240 220 T480 210 T800 226 Q1200 212 1600 232 L1600 300 L-800 300Z" fill="#05060a"/>
    <g fill="#06070b">
      <rect x="250" y="130" width="300" height="100"/>
      <polygon points="240,132 400,78 560,132"/>
      <rect x="196" y="152" width="64" height="80"/>
      <polygon points="190,152 228,120 266,152"/>
      <rect x="540" y="152" width="64" height="80"/>
      <polygon points="534,152 572,120 610,152"/>
      <rect x="380" y="40" width="40" height="70"/>
      <polygon points="372,42 400,4 428,42"/>
      <rect x="300" y="92" width="11" height="32"/>
      <rect x="489" y="92" width="11" height="32"/>
    </g>
    <g fill="#e8b860">
      <rect x="392" y="60" width="16" height="22" opacity=".55"/>
      <rect x="280" y="150" width="12" height="20" opacity=".7"/>
      <rect x="330" y="150" width="12" height="20" opacity=".25"/>
      <rect x="458" y="150" width="12" height="20" opacity=".6"/>
      <rect x="508" y="150" width="12" height="20" opacity=".2"/>
      <rect x="560" y="176" width="12" height="20" opacity=".5"/>
      <rect x="384" y="186" width="32" height="44" opacity=".35"/>
    </g>
    <rect x="212" y="176" width="14" height="22" fill="#d9562b" opacity=".8"/>
  </svg>`;

  const RYOKAN = `<svg class="mansion" viewBox="0 0 800 300" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <path d="M-800 170 L-640 120 L-520 150 L-380 96 L-240 140 L-120 112 L0 160 L80 108 L150 138 L250 70 L350 128 L440 92 L540 140 L650 78 L800 146 L900 110 L1040 150 L1180 100 L1320 146 L1460 118 L1600 150 L1600 300 L-800 300Z" fill="#0b0f17" opacity=".85"/>
    <path d="M250 70 L228 86 L252 81 L272 90Z M650 78 L628 94 L652 89 L674 98Z M80 108 L64 120 L82 116 L96 122Z M-380 96 L-398 110 L-378 106 L-360 113Z M1180 100 L1162 114 L1182 110 L1200 117Z" fill="#d6dee8" opacity=".22"/>
    <path d="M-800 236 Q-400 222 0 236 Q160 220 320 230 T640 224 T800 232 Q1200 222 1600 236 L1600 300 L-800 300Z" fill="#c9d3df" opacity=".14"/>
    <path d="M-800 246 Q-400 238 0 246 Q200 236 400 242 T800 244 Q1200 238 1600 246 L1600 300 L-800 300Z" fill="#05060a"/>
    <g fill="#06070b">
      <rect x="200" y="118" width="270" height="42"/>
      <polygon points="178,122 492,122 458,92 212,92"/>
      <rect x="168" y="168" width="334" height="76"/>
      <polygon points="146,172 524,172 500,152 170,152"/>
      <polygon points="292,176 378,176 335,146"/>
      <rect x="590" y="194" width="112" height="50"/>
      <polygon points="572,198 720,198 692,170 600,170"/>
      <rect x="543" y="222" width="6" height="22"/>
      <polygon points="530,224 562,224 546,212"/>
    </g>
    <g fill="#dfe6ee" opacity=".6">
      <path d="M212 92 L458 92 L466 99 L204 99Z"/>
      <path d="M170 152 L500 152 L508 158 L162 158Z"/>
      <path d="M600 170 L692 170 L700 176 L592 176Z"/>
      <path d="M335 146 L352 158 L318 158Z"/>
      <path d="M546 212 L556 219 L536 219Z"/>
    </g>
    <g fill="#e8b860">
      <rect x="222" y="128" width="30" height="20" opacity=".5"/>
      <rect x="266" y="128" width="30" height="20" opacity=".2"/>
      <rect x="374" y="128" width="30" height="20" opacity=".55"/>
      <rect x="418" y="128" width="30" height="20" opacity=".25"/>
      <rect x="186" y="186" width="40" height="30" opacity=".4"/>
      <rect x="440" y="186" width="40" height="30" opacity=".3"/>
      <rect x="318" y="196" width="34" height="48" opacity=".5"/>
      <rect x="540" y="226" width="12" height="8" opacity=".8"/>
    </g>
    <rect x="610" y="206" width="46" height="28" fill="#f0c878" opacity=".85"/>
    <path d="M621.5 206 V234 M633 206 V234 M644.5 206 V234 M610 220 H656" stroke="#3a2a14" stroke-width="1.2" opacity=".7"/>
    <g fill="#c9d3df" opacity=".35">
      <ellipse cx="514" cy="250" rx="3" ry="1.4"/><ellipse cx="528" cy="252" rx="3" ry="1.4"/>
      <ellipse cx="544" cy="250" rx="3" ry="1.4"/><ellipse cx="560" cy="252" rx="3" ry="1.4"/>
      <ellipse cx="576" cy="250" rx="3" ry="1.4"/>
    </g>
    <g fill="#b3202e">
      <circle cx="716" cy="236" r="4"/><circle cx="728" cy="230" r="3"/><circle cx="738" cy="238" r="3.5"/>
    </g>
  </svg>`;

  const PLACES = [
    ['北関東', 'きたかんとう'], ['三陸', 'さんりく'], ['銀座', 'ぎんざ'], ['大阪', 'おおさか'], ['東京', 'とうきょう'],
    ['鎌倉', 'かまくら'], ['新潟', 'にいがた'], ['横浜', 'よこはま'], ['京都', 'きょうと'], ['祇園', 'ぎおん'],
  ];

  window.SERIES = [
    {
      id: 'shirasagi',
      no: 'FILE 01',
      title: '白鷺館殺人事件',
      subtitle: '嵐の夜の八人',
      season: '十一月　嵐',
      setting: '湖畔の洋館',
      tagline: '吊り橋の向こうの洋館で、館の主が殺された。',
      synopsis: '嵐で外界から閉ざされた湖畔の洋館〈白鷺館〉。製薬会社の会長・鷹宮源一郎は、記念会見で「ある重大な事実」を公表すると告げた夜、書斎で遺体となって見つかる。家族、使用人、主治医、弁護士――館にいた八人の過去と嵐の一日をたどり、偽りの時刻を暴け。',
      cast: '鷹宮源一郎・玲子・圭介・美咲・久我修・篠原澪・真壁透・柏木弘樹',
      saveKey: 'shirasagi-save-v1',
      files: ['js/series/shirasagi/data.js', 'js/series/shirasagi/past.js', 'js/series/shirasagi/stories.js'],
      weather: 'rain',
      art: MANSION,
      artStages: ['road', 'dawn'],
      totals: { chars: 8, clues: 49 },
      ruby: [
        ['白鷺館', 'しらさぎかん'],
        ['白鷺', 'しらさぎ'],
        ['鷹宮', 'たかみや'],
        ['源一郎', 'げんいちろう'],
        ['玲子', 'れいこ'],
        ['圭介', 'けいすけ'],
        ['美咲', 'みさき'],
        ['静江', 'しずえ'],
        ['久我', 'くが'],
        ['(?<=久我[\\s　]?)修', 'おさむ'],
        ['篠原', 'しのはら'],
        ['芳江', 'よしえ'],
        ['澪', 'みお'],
        ['真壁', 'まかべ'],
        ['(?<=真壁[\\s　]?)透', 'とおる'],
        ['(?<!電)灯(?!（)', 'あかり'],
        ['柏木', 'かしわぎ'],
        ['弘樹', 'ひろき'],
        ['白川', 'しらかわ'],
        ['(?<=白川[\\s　]?)怜', 'れい'],
        ['白夜', 'びゃくや'],
      ],
    },
    {
      id: 'yukitsubaki',
      no: 'FILE 02',
      title: '雪椿亭殺人事件',
      subtitle: '吹雪の夜の八人',
      season: '一月　吹雪',
      setting: '雪国の老舗旅館',
      tagline: '雪の上には、被害者ひとりの足跡だけが残されていた。',
      synopsis: '雪崩で道を断たれた温泉宿〈雪椿亭〉。最後の長編『落椿』を「実話だ」と言い放った推理作家・東雲冬彦が、離れ「椿庵」で絞殺される。宿の女たち、板長、編集者、書生、駐在――二十五年前の雪の夜に結ばれた八人の因縁をほどき、雪の上の嘘を暴け。',
      cast: '東雲冬彦・雪村志乃・雪村椿・氷川迅・桐生琴音・早瀬湊・黒崎恭一・白石小春',
      saveKey: 'yukitsubaki-save-v1',
      files: ['js/series/yukitsubaki/data.js', 'js/series/yukitsubaki/past.js', 'js/series/yukitsubaki/stories.js'],
      weather: 'snow',
      art: RYOKAN,
      artStages: ['snowroad', 'dawnsnow'],
      totals: { chars: 8, clues: 57 },
      ruby: [
        ['雪椿亭', 'ゆきつばきてい'],
        ['雪椿', 'ゆきつばき'],
        ['椿庵', 'つばきあん'],
        ['落椿', 'おちつばき'],
        ['雪の轍', 'ゆきのわだち'],
        ['東雲', 'しののめ'],
        ['冬彦', 'ふゆひこ'],
        ['雪村', 'ゆきむら'],
        ['志乃', 'しの'],
        ['(?<![白赤紅い])椿(?![庵亭])', 'つばき'],
        ['氷川', 'ひかわ'],
        ['(?<=氷川[\\s　]?)迅', 'じん'],
        ['桐生', 'きりゅう'],
        ['琴音', 'ことね'],
        ['早瀬', 'はやせ'],
        ['湊', 'みなと'],
        ['黒崎', 'くろさき'],
        ['恭一', 'きょういち'],
        ['白石', 'しらいし'],
        ['小春', 'こはる'],
        ['小雪', 'こゆき'],
        ['雪菜', 'ゆきな'],
        ['鳴沢', 'なるさわ'],
        ['花政', 'はなまさ'],
        ['千鳥', 'ちどり'],
        ['文潮社', 'ぶんちょうしゃ'],
      ],
    },
  ];

  window.SERIES_PLACES = PLACES;
})();
