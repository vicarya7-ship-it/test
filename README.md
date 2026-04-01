# 眼を、閉じるな。

Webカメラで目の状態を検知し、目を閉じたり画面から逸れたりすると怪異が接近する、和風ホラーのスライドパズル脱出ゲームです。  
HTML + CSS + Vanilla JS だけで構成しているため、GitHub Pages などの静的ホスティングで公開できます。

## 遊び方

1. カメラアクセスを許可します。
2. タイトル画面でステージを選びます。
3. 目を開けたままスライドパズルを完成させます。
4. 目を閉じ続けたり、顔が映らなくなると怪異接近ゲージが増えます。
5. パズルを完成させる前にゲージが 100% へ達するとゲームオーバーです。

補足:

- 短いまばたきは 0.5 秒の猶予で無視します。
- 顔が映らない状態は「目を逸らしている」とみなし、目を閉じているときより速く怪異が近づきます。
- クリア済みステージは `localStorage` に保存されます。

## 画像の差し替え

画像ファイルはこのプロジェクトには含めていません。次の名前で配置してください。

### パズル画像

配置先: `assets/puzzle/`

- `stage1.jpg`
- `stage2.jpg`
- `stage3.jpg`
- `stage4.jpg`
- `stage5.jpg`

### 怪異画像

配置先: `assets/horror/`

- `face1.png`
- `face2.png`
- `face3.png`
- `face4.png`
- `face5.png`

補足:

- 画像が見つからない場合は、Canvas でダミー画像を自動生成して表示します。
- 画像サイズは正方形に近いものを推奨します。

## ローカル起動方法

`file://` で直接開くとカメラ API が使えないため、必ずローカルサーバー経由で起動してください。

### Live Server を使う場合

1. VS Code でこのフォルダを開きます。
2. `index.html` を右クリックします。
3. `Open with Live Server` を実行します。

### `npx serve .` を使う場合

```bash
cd day_06/horror-puzzle
npx serve .
```

起動後、表示された URL をブラウザで開いてください。

## GitHub Pages 公開手順

### このフォルダを単体リポジトリとして公開する場合

1. `day_06/horror-puzzle` の中身をリポジトリのルートとして push します。
2. GitHub の `Settings` → `Pages` を開きます。
3. `Build and deployment` の `Source` を `Deploy from a branch` にします。
4. `Branch` で公開対象ブランチと `/ (root)` を選びます。
5. 数分待って公開 URL を確認します。

### 学習用の大きなリポジトリ内で公開する場合

GitHub Pages の標準設定では任意サブフォルダをそのまま公開できないため、次のどちらかを選びます。

- `day_06/horror-puzzle` の内容を `docs/` にコピーして `docs` を公開対象にする
- GitHub Actions で `day_06/horror-puzzle` を Pages へデプロイする

どちらの方法でも、サーバーサイド処理は不要です。

## 使用ライブラリ

- `face-api.js` 0.22.2
  - CDN: `https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js`
  - weights CDN: `https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights/`
  - License: MIT

## ファイル構成

```text
horror-puzzle/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── main.js
│   ├── faceDetect.js
│   ├── puzzle.js
│   ├── horror.js
│   └── audio.js
├── assets/
│   ├── puzzle/
│   └── horror/
└── README.md
```
