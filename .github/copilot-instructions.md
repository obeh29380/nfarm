# 農園管理システム (GitHub Pages版) 開発ガイドライン

あなたは、静的サイトとして動作する農園管理アプリケーションの開発エキスパートです。以下のファイル構造と実装方針に従ってコードを生成してください。
## 前提条件

- **回答は必ず日本語でしてください。**
- **指示内容からデータ構造の変更、指示書の内容変更が必要だと思われる場合は適宜行ってください。**

## 1. プロジェクトの概要
GitHub Pages上で、各農場の畝（うね）ごとの植栽状況、収穫時期、追肥状況を可視化します。サーバーサイドDBは使用せず、ローカルのJSONファイルをデータソースとします。

## 2. 推奨ファイル構造
- `/index.html`: メインダッシュボード。農場の全体俯瞰図を表示。
- `/css/style.css`: 畝のレイアウト、状態別（成長中、収穫、作業忘れ、空き）の色分け。
- `/js/app.js`: `fetch`を使用したJSON読み込みとDOM生成。
- `/data/farms.json`: 農場データの保存先。
- `/data/farms/<field_id>.json`: 耕作データの保存先。
- `/data/farms/<field_id>_finished.json`: 完了済み耕作データの保存先。

## 3. データ構造定義
JSONオブジェクトの配列として、以下のスキーマを維持してください。
- `data/farms.json`
    - `field_id`: 農場識別子 (string)
    - `field_name`: 農場名 (string)
- `data/farms/<field_id>.json`, `data/farms/<field_id>_finished.json`
    - `row_number`: 畝識別番号 (number) ※配置には使用しない。一意の識別子として使う。
    - `crop_name`: 作物名 (string)
    - `planted_date`: 植付日 (YYYY-MM-DD)
    - `fertilize_date`: 追肥予定日 (YYYY-MM-DD)(リスト)
    - `last_fertilized`: 追肥実施日 (YYYY-MM-DD)(リスト)
    - `harvest_expected`: 収穫予定日 (YYYY-MM-DD)
    - `harvested_date`: 収穫実施日 (YYYY-MM-DD)
    - `harvest_guideline`: 収穫目安 (string)
    - `x`: 畝の西端（または左端）のx座標 (number, 左上が原点)
    - `y`: 畝の北端（または上端）のy座標 (number, 左上が原点)
    - `direction`: 畝の向き (`"horizontal"` = 東西方向 / `"vertical"` = 南北方向)
    - `row_length`: 畝の長さ (number)。`direction`が`"horizontal"`なら東西長さ、`"vertical"`なら南北長さ。
    - `row_width`: 畝の幅 (number)。`direction`が`"horizontal"`なら南北幅、`"vertical"`なら東西幅。
    - `status`: 状態 (`"growing"`, `"harvesting"`, `"empty"`, `"planned"`, `"finished"`, `"path"`)
    - `warning`: 注意事項 (string)
    - `memo`: 備考 (string)

## 4. 実装の原則
- **Vanilla JS優先**: 外部ライブラリを避け、標準の `fetch` APIとDOM操作を使用して軽量に保つ。
- **レスポンシブデザイン**: 農場（現場）のモバイル端末から確認しやすいよう、FlexboxやGridを活用する。
- **可視化ロジック**:
    - `harvest_expected` が現在時刻に近い場合は警告表示。
    - 現在日時が `fertilize_date` に近い日付がある場合に追肥推奨マークを表示。
    - 畝を選択すると、詳細情報（植付日、追肥予定日、収穫予定日、注意事項、備考）を表示するモーダルやサイドパネルを実装。
    - 実際の畝の形や配置を反映したレイアウト（地図のように）を作成し、視覚的にわかりやすくする。
        - 方角は、北が画面上固定。
        - 畝は東西にも南北にも配置できる。`direction: "horizontal"` は東西方向（横長）、`"vertical"` は南北方向（縦長）の畝。
        - 農場マップは `position: relative` のコンテナとし、各畝は `position: absolute` で `x, y` 座標（メートル）をピクセル変換して配置する。
        - マップのサイズは全畝の座標＋長さの最大値から自動算出する。
        - 畝の幅（`row_width`、cm単位）もスケール変換してピクセル高さ（横長畝）または幅（縦長畝）に反映する。
        - 農道（`status: "path"`）は畝と同じスキーマで管理し、1エントリで任意の長さを持てる。縦断・横断いずれも1エントリで表現できる。
    - 同じ`row_number`を持つ畝が複数存在する場合、`<field_id>_finished.json`と`<field_id>.json`の両方に存在する場合は、`<field_id>_finished.json`のデータは表示しない。
    - `field_id`ごとにタブを切り替えるUIを提供し、複数の農場を管理できるようにする。
    - `status` が "finished" の場合**: 畝をグレーアウトし、完了済みのデータは `<field_id>_finished.json` に移動して管理するよう警告を出す。
    - 長さはすべてmm単位で統一する（例: `row_length`はmm単位で保存し、JSで必要に応じてmやcmに変換して表示）。
    - 表示上は、畝の長さはm単位、幅はcm単位でわかりやすく表示する（例: `row_length`が15000なら「15m」、`row_width`が180なら「180cm」）。ただし、内部的にはすべてmm単位で統一して管理する。これにより、データの一貫性を保ちつつ、ユーザーにはわかりやすい単位で提供できる。
- **読み取り専用**: このシステムは静的な表示に特化する。データの更新はGitHub上のJSONファイルを直接編集（またはGitHub Mobile経由）することを前提とする。

## 5. コーディングスタイル
- コメントは日本語で記述すること。
- モジュール性を高めるため、日付計算などのロジックは `js/utils.js` に分離することを推奨。

## 6. デプロイと運用
- GitHub Pagesにデプロイする前提とする。
