# スキル一覧（構造化作戦会議用）

| ID | 駒名 | skill_desc | skill_type | target_rule | effect_summary_type | trigger_timing | proc_chance | duration_turns | parse_status |
|----|------|-----------|-----------|------------|-------------------|--------------|------------|--------------|------------|
| 1 | 砲(砲台) | 敵駒を取るときは駒を1つまたぐ。 | active_or_triggered | enemy_piece | capture_with_leap | on_capture_attempt |  |  | rule_only_v2 |
| 2 | 竜(小竜) | 「泉」駒によって覚醒し、「辰」に変身する。 | passive | self | transform_piece | on_condition_met |  |  | rule_only_v2 |
| 3 | 炎(炎魔) | 10%の確率で周囲の敵駒を消滅させる。 | passive | adjacent_area | remove_piece | passive | 0.1 |  | rule_only_v2 |
| 4 | 火(火神) | 移動時20％の確率で相手の手持ち駒を1つ燃やす。 | active_or_triggered | enemy_hand | destroy_hand_piece | on_move | 0.2 |  | rule_only_v2 |
| 5 | 水(水神) | 水の流れにより周囲の敵駒を押し流す。 | passive | adjacent_area | forced_move | passive |  |  | rule_only_v2 |
| 6 | 波(波使) | 波の伝播により周囲の敵駒を押し流す。 | passive | adjacent_area | forced_move | passive |  |  | rule_only_v2 |
| 7 | 木(樹木) | 木の成長により周囲に「木」駒を召喚する。 | passive | adjacent_area | summon_piece | passive |  |  | rule_only_v2 |
| 8 | 葉(大葉) | 各敵駒ごとに10%の確率で、ランダムな方向に1マス移動させる。 | passive | enemy_piece | forced_move | passive | 0.1 |  | rule_only_v2 |
| 9 | 光(光神) | 壁で反射して継続移動する。 | passive | self | reflective_movement | on_move |  |  | rule_only_v2 |
| 10 | 星(星使) | 敵駒に取られたとき、40％の確率で自分の手持ち駒に戻る | active_or_triggered | self | return_to_hand | on_captured | 0.4 |  | rule_only_v2 |
| 11 | 闇(闇神) | 周囲の敵駒を次の番まで闇で覆う。 | passive | adjacent_area | apply_status | passive |  | 1 | rule_only_v2 |
| 12 | 魔(悪魔) | 周囲の敵駒を10%の確率で消滅させる。 | passive | adjacent_area | remove_piece | passive | 0.1 |  | rule_only_v2 |
| 13 | 鉄(鉄鉱石) | 磁力効果により周囲の敵駒を遠ざける。 | passive | adjacent_area | forced_move | passive |  |  | rule_only_v2 |
| 14 | 錫(錫鉱石) | 10％の確率で周囲の敵駒を行動不能にする。 | passive | adjacent_area | apply_status | passive | 0.1 |  | rule_only_v2 |
| 15 | 宝(宝) | 20%の確率で「金」・「銀」・「銅」駒を獲得する。 | passive | unspecified | gain_piece | passive | 0.2 |  | rule_only_v2 |
| 16 | 電(電気) | 20%の確率で敵を感電させ1ターン動けなくさせる。 | passive | unspecified | apply_status | passive | 0.2 | 1 | rule_only_v2 |
| 17 | 雷(雷) | 10%の確率で相手の持ち駒を消滅させる。 | passive | hand_piece | remove_piece | passive | 0.1 |  | rule_only_v2 |
| 18 | 時(時人) | 時停止により周囲の敵駒を2ターン行動不能にする。 | passive | adjacent_area | apply_status | passive |  | 2 | rule_only_v2 |
| 19 | 氷(氷神) | 周囲の敵を凍らせ2ターン動けなくする。 | passive | adjacent_area | apply_status | passive |  | 2 | rule_only_v2 |
| 20 | 雪(雪だるま) | 移動時20%の確率で「氷」駒を1つ獲得する。 | active_or_triggered | unspecified | gain_piece | on_move | 0.2 |  | rule_only_v2 |
| 21 | 砂(砂) | 左右の「砂」駒と連携移動する。 | passive | ally_piece | linked_action | on_move |  |  | rule_only_v2 |
| 22 | 風(風神) | 強風により周囲の敵駒を押し流す。 | passive | adjacent_area | forced_move | passive |  |  | rule_only_v2 |
| 23 | 苔(苔) | 移動時増殖する。 | active_or_triggered | board_cell | summon_piece | on_move |  |  | rule_only_v2 |
| 24 | 魚(魚) | 30%の確率で敵駒を溺れさせ行動不能にする。 | passive | enemy_piece | apply_status | passive | 0.3 |  | rule_only_v2 |
| 25 | 雲(雲) | 相手の駒は取れないが味方の駒を取れる。 | passive | unspecified | capture_constraint | passive |  |  | rule_only_v2 |
| 26 | 虹(虹) | 移動時、周囲8マスにいる敵駒の行動範囲を4ターン縦横1マスに制限する。 | active_or_triggered | enemy_piece | modify_movement | on_move |  | 4 | rule_only_v2 |
| 27 | 毒(毒虫) | 通ったマスを2ターン毒マスにする。 | passive | board_cell | board_hazard | passive |  | 2 | rule_only_v2 |
| 28 | 沼(沼主) | 周囲の敵駒の行動範囲を上下1マスのみにする。 | passive | adjacent_area | modify_movement | passive |  |  | rule_only_v2 |
| 29 | 映(映像人), 鏡(鏡) | 正面の敵駒の動きをコピーする。 | passive | front_enemy | copy_ability | passive |  |  | rule_only_v2 |
| 30 | あ(あ人) | 周囲の敵駒を「歩」に変化させる。 | passive | adjacent_area | transform_piece | passive |  |  | rule_only_v2 |
| 31 | 牢(牢獄), 柵(柵) | 移動時敵駒を1つランダムに2ターン行動不能にする。 | active_or_triggered | enemy_piece | apply_status | on_move |  | 2 | rule_only_v2 |
| 32 | 嶺(山嶺) | 移動時20%の確率で周囲に「山」駒を出現させる。 | active_or_triggered | adjacent_area | summon_piece | on_move | 0.2 |  | rule_only_v2 |
| 33 | 峰(山峰) | 画数が10画以上の敵駒を無効化する。 | passive | enemy_piece | disable_piece | passive |  |  | rule_only_v2 |
| 34 | 岩(岩山) | 移動時左右に岩の障害物を配置する。 | active_or_triggered | board_cell | summon_piece | on_move |  |  | rule_only_v2 |
| 35 | 鉱(鉱山) | 20%の確率で味方の「歩」を「金」「銀」「銅」に変化させる。 | passive | unspecified | transform_piece | passive | 0.2 |  | rule_only_v2 |
| 36 | 墓(墓主) | 移動時20％の確率で「霊」駒を召喚する。 | active_or_triggered | unspecified | summon_piece | on_move | 0.2 |  | rule_only_v2 |
| 37 | 霊(霊体) | 敵駒に取られても相手の持ち駒に加わらない。 | passive | self | capture_constraint | on_captured |  |  | rule_only_v2 |
| 38 | 幻(幻影) | 周囲に空きマスがあるとき、被捕獲時50％で回避して空きマスへ移動。 | passive | enemy_piece | defense_or_immunity | passive | 0.5 |  | rule_only_v2 |
| 39 | 霧(霧) | 周囲の敵駒を30％の確率で相手の持ち駒に送る。 | passive | adjacent_area | send_to_hand | passive | 0.3 |  | rule_only_v2 |
| 40 | 月(月) | ターンごとに移動能力が変化する。 | passive | self | modify_movement | on_turn_start |  |  | rule_only_v2 |
| 41 | 舟(舟主) | 移動時後方の味方駒を連れていく。 | active_or_triggered | ally_piece | linked_action | on_move |  |  | rule_only_v2 |
| 42 | 機(機械) | 左または右隣りの見方駒のスキルをコピーする。 | passive | unspecified | copy_ability | passive |  |  | rule_only_v2 |
| 43 | 歯(歯車) | 隣接する駒が動いたらそれに連動して動く。 | active_or_triggered | self | linked_action | on_other_piece_move |  |  | rule_only_v2 |
| 44 | 家(家) | 「民」駒を自陣4行のランダムな場所に召喚(召喚制限は5体)。 | passive | unspecified | summon_piece | passive |  |  | rule_only_v2 |
| 45 | 民(住民) | 「畑」があると斜め前も移動可能となる。 | passive | unspecified | modify_movement | passive |  |  | rule_only_v2 |
| 46 | 畑(畑) | 民駒を斜め前にも移動可能にする。 | passive | unspecified | modify_movement | passive |  |  | rule_only_v2 |
| 47 | 泉(泉) | 味方駒を強化し敵駒から取られないようにする(5ターン持続)。味方の「竜」を覚醒させる。 | passive | ally_piece | composite | passive |  | 5 | rule_only_v2 |
| 48 | 辰(辰神) | 移動時10%の確率で周囲8マスの敵駒を1つ消滅させる。 | active_or_triggered | adjacent_8 | remove_piece | on_move | 0.1 |  | rule_only_v2 |
| 49 | K(K博士) | 40%で実験体を召喚。2回取られないと消えない。 | passive | unspecified | composite | passive | 0.4 |  | rule_only_v2 |
| 50 | 実(実験体) | 敵駒を「異」駒に変化させる。 | passive | enemy_piece | transform_piece | passive |  |  | rule_only_v2 |
| 51 | 異(変異体) | 変化前の駒の能力を継承する。 | passive | unspecified | transform_piece | passive |  |  | rule_only_v2 |
| 52 | 刀(名刀) | 敵駒を取ったとき、左右にいる敵駒もまとめて取る。 | active_or_triggered | left_right | multi_capture | on_capture |  |  | rule_only_v2 |
| 53 | 鎧(武具) | 敵駒を取れないが敵駒から取られない。 | passive | enemy_piece | defense_or_immunity | passive |  |  | rule_only_v2 |
| 54 | 銃(火縄銃) | 移動方向の1、2マス先に敵駒がいる場合、まとめて取る。 | passive | enemy_piece | multi_capture | passive |  |  | rule_only_v2 |
| 55 | 書(書物) | 一手前に相手が移動させた駒と同じ移動範囲になる。 | passive | self | copy_ability | on_turn_start |  |  | rule_only_v2 |
| 56 | 封(封印) | 斜め4方向の敵駒のスキルを封印する。 | passive | enemy_piece | seal_skill | passive |  |  | rule_only_v2 |
| 57 | 轟(轟音) | 轟音で移動時両隣の敵駒を押し出す。 | active_or_triggered | enemy_piece | forced_move | on_move |  |  | rule_only_v2 |
| 58 | 犇(猛牛) | 移動時10％の確率で周囲の空きマスに「犇」駒を召喚する。 | active_or_triggered | adjacent_area | summon_piece | on_move | 0.1 |  | rule_only_v2 |
| 59 | 礼(礼拝者) | 他の味方駒が取られたときに身代わりとなる。。 | active_or_triggered | ally_piece | substitute | on_captured |  |  | rule_only_v2 |
| 60 | 聖(聖者) | 周囲8マスにいる全ての駒のスキルと移動を無効化する。 | passive | adjacent_8 | disable_piece | passive |  |  | rule_only_v2 |
| 61 | 剣(聖剣) | 敵の攻撃を左右の空きマスに移動して回避する。 | passive | left_right | defense_or_immunity | passive |  |  | rule_only_v2 |
| 62 | 盾(聖盾) | 前方以外の隣接する味方への攻撃を50%で無効化する。 | passive | unspecified | disable_piece | passive | 0.5 |  | rule_only_v2 |
| 63 | 病(病魔) | 取られると相手駒を感染状態にし2ターン移動不能にする。 | active_or_triggered | enemy_piece | apply_status | on_captured |  | 2 | rule_only_v2 |
| 64 | 薬(妙薬) | 隣接する味方駒の移動範囲を1マス延長する。 | passive | ally_piece | modify_movement | passive |  |  | rule_only_v2 |
| 65 | 滝(大滝) | 移動時20％の確率で周囲の敵駒を全て相手の持ち駒に流す。 | active_or_triggered | adjacent_area | forced_move | on_move | 0.2 |  | rule_only_v2 |
| 66 | 穴(大穴) | 取られた時、周囲のマスに4ターン侵入不可の穴を生成する。 | active_or_triggered | adjacent_area | board_hazard | on_captured |  | 4 | rule_only_v2 |
| 67 | 淵(深淵) | 取られた時、相手駒を淵に沈めて3ターン行動不能にする。 | active_or_triggered | unspecified | apply_status | on_captured |  | 3 | rule_only_v2 |
| 68 | 鬼(赤鬼) | 移動時に左右の敵駒を1マス遠ざける。敵駒を取った時、周囲のランダムな空マス1つを×マスにする。 | active_or_triggered | adjacent_area | composite | on_capture |  |  | rule_only_v2 |
| 69 | 朧(朧月) | 盤面に「死」、「魂」駒が残っていると、敵駒からの攻撃を回避する。 | passive | enemy_piece | defense_or_immunity | passive |  |  | rule_only_v2 |
| 70 | 死(死神) | 味方の駒を取った敵駒に5ターン後に消滅する呪いをかける。 | passive | enemy_piece | remove_piece | passive |  | 5 | rule_only_v2 |
| 71 | 魂(魂) | 盤面に「魂」が残っているとき、相手は「王」を攻撃できない。 | passive | board_cell | defense_or_immunity | passive |  |  | rule_only_v2 |
| 72 | 獣(獣神) | 移動時、前後左右に隣接する敵駒をすべて2ターン行動不能にする。 | active_or_triggered | enemy_piece | apply_status | on_move |  | 2 | rule_only_v2 |
| 73 | 禽(猛禽類) | 移動後、真後ろ1マスが空いていればランダムな味方駒をそのマスへ移動させる。 | active_or_triggered | ally_piece | relocate_ally | on_move |  | — | rule_only_v2 |
| 74 | 心(心), 悟(悟り) | 移動時に周囲の敵駒を1ターン行動不能にする。 | active_or_triggered | adjacent_area | apply_status | on_move |  | 1 | rule_only_v2 |
| 75 | 鬱(鬱) | 移動時もともといたマスを行動不能マスにする。 | active_or_triggered | board_cell | apply_status | on_move |  |  | rule_only_v2 |
| 76 | 乙(乙) | 相手の駒を取ると、もう一度だけ移動ができる。 | active_or_triggered | unspecified | extra_action | on_capture |  |  | rule_only_v2 |
| 77 | 薔(薔薇) | 上下1マスを茨化して、相手が持ち駒をそのマスに置けないようにする。 | passive | hand_piece | board_hazard | passive |  |  | rule_only_v2 |
| 78 | 菊(菊) | 隣接する味方駒一体に復活効果を付与する。 | passive | ally_piece | revive | passive |  |  | rule_only_v2 |
| 79 | 桜(桜) | 移動後同じ行にいる味方駒の行動範囲が1マス伸びる。 | active_or_triggered | ally_piece | modify_movement | after_move |  |  | rule_only_v2 |
| 80 | 凹(凹凸) | 盤面の端まで貫通して移動する。 | passive | self | modify_movement | passive |  |  | rule_only_v2 |
| 81 | 凸(凸凹) | 2回行動ができる。 | passive | unspecified | extra_action | passive |  |  | rule_only_v2 |
| 82 | 焼(焼く) | 敵駒を取った時盤面のランダムなマスに「炎」駒を召喚する。 | active_or_triggered | enemy_piece | summon_piece | on_capture |  |  | rule_only_v2 |
| 83 | 炒(炒める) | 敵駒を取ったらもう一度だけ移動できる。 | passive | enemy_piece | extra_action | passive |  |  | rule_only_v2 |
| 84 | 煮(煮る) | 敵駒を取った時盤面のランダムなマスに「火」駒を召喚する。 | active_or_triggered | enemy_piece | summon_piece | on_capture |  |  | rule_only_v2 |
| 85 | 陽(太陽) | 周囲の味方駒のスキル発動確率を30％増加させる。味方の「陰」駒が同じ行や列にいるとき敵駒に取られない。 | passive | ally_piece | composite | passive | 0.3 |  | rule_only_v2 |
| 86 | 陰(陰) | 周囲の敵駒を呪い状態にしてスキル発動を阻害する。味方の「陽」が同じ行や列にいるとき敵駒に取られない。 | passive | adjacent_area | composite | passive |  |  | rule_only_v2 |
| 87 | 牛(牛) | 後ろに移動した分前に行けるマスが増える。移動途中の駒を全て取る。 | active_or_triggered | self | composite | on_move |  |  | rule_only_v2 |
| 88 | 豚(豚) | 取った敵駒の移動範囲を継承する。 | passive | enemy_piece | inherit_ability | passive |  |  | rule_only_v2 |
| 89 | 銭(銭) | 移動時に20％の確率で「金」に変化、10％の確率で「宝」に変化する。 | active_or_triggered | unspecified | transform_piece | on_move | 0.2 |  | rule_only_v2 |
| 90 | 財(財宝) | 敵駒を取ったとき、味方の「銭」駒をひとつ取った敵駒に変化させる。 | active_or_triggered | enemy_piece | transform_piece | on_capture |  |  | rule_only_v2 |
| 91 | 巨(巨人) | 相手から取られない。特殊効果を受けない。移動時に移動先の2×2領域の敵駒をすべて取る。 | passive | self | composite | passive |  |  | rule_only_v2 |
| 92 | （なし） | 移動不可。敵駒を取れない。敵駒に取られない。 | passive | enemy_piece | composite | passive |  |  | rule_only_v2 |
| 93 | 灯(ともし火) | 移動時20％の確率で味方の「歩」駒ひとつを「火」駒に変化させる。 | active_or_triggered | unspecified | transform_piece | on_move | 0.2 |  | rule_only_v2 |
| 97 | 爆(爆) | 爆発で周囲の敵駒を吹き飛ばす破壊的な駒。 | active_or_passive | unspecified | scripted | on_move |  |  | manual |
| 98 | 煽(煽) | 相手を煽りたい人の為に。 | active_or_passive | unspecified | scripted | on_move |  |  | manual |
| 99 | 室(室) | セーフルームを用意して「王」を守る。 | active_or_passive | unspecified | scripted | on_move |  |  | manual |
| 100 | 定(定) | 相手の戦略を固定しろ。 | active_or_passive | unspecified | scripted | on_move |  |  | manual |
| 101 | 安(安) | 敵の駒を安くする。 | active_or_passive | enemy_piece | scripted | on_move |  |  | rule_only_v2 |
| 102 | 宋(宋) | 味方に繁栄をもたらす。 | active_or_passive | adjacent_area | summon_piece | on_move | 0.2 |  | rule_only_v2 |
| 103 | 辺(辺) | 盤面の辺を利用した戦略。 | active_or_passive | unspecified | scripted | on_move |  |  | manual |
| 104 | 逸(逸) | 敵駒を盤面から逸脱させる。 | active_or_passive | enemy_piece | scripted | on_move | 0.3 |  | rule_only_v2 |
| 105 | 進(進) | 次はどこに進んでいくのか。 | active_or_passive | self | modify_movement | on_turn_start |  |  | rule_only_v2 |
| 106 | 逃(逃) | 移動すると味方の王も同じ方向へ逃がす緊急離脱の駒。 | active_or_passive | unspecified | scripted | on_move |  |  | manual |
| 107 | 艸(艸) | 草の力を操り盤面を支配する自然の駒。 | active_or_passive | unspecified | scripted | on_move |  |  | manual |
| 108 | 閹(閹) | 敵の動きを封じる封印の駒。 | active_or_passive | unspecified | scripted | on_move |  |  | manual |
| 109 | 賚(賚) | 報酬を与え味方を強化する恩恵の駒。 | active_or_passive | unspecified | scripted | on_move |  |  | manual |
| 110 | 殲(殲) | 敵を一掃する殲滅の駒。 | active_or_passive | unspecified | scripted | on_move |  |  | manual |
| 111 | 膠(膠) | 盤面を膠着させ敵の動きを止める粘着の駒。 | active_or_passive | unspecified | scripted | on_move |  |  | manual |
