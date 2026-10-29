# タスク: project-skill-install

- 状態: done
- 仕様版: 1
- コード基点: f3dd51d7e6a2fd77cab98b016a8c78148fff80fe
- 担当範囲: authoring-skills/README.md、README.md（導入先案内）、必要ならauthoring-skills/INSTALL.md
- 依存: なし

## 目的・対象外

Windows/Linuxでの利用条件を正確に説明し、cloneなしで任意のプロジェクトに3作成スキルを導入する導線を提供する。Codex標準skill-installerのdownload方式を再利用する。専用インストーラや既存ハーネスruntimeの変更は不要。

## 受入条件

1. 今回の3スキルがOS固有コードなしのMarkdownであること、利用先Codexのスキル対応が必要であること、macOSで検証済みだがWindows/Linux実機は未検証であることを区別する。既存ハーネスはPython/Git等を使う別製品として説明。
2. 対象プロジェクトをCodexで開き、skill-installerに非公開repo karladev001-eng/harnessのauthoring-skills/{create-rulebooks,create-subagent,create-harness} を対象プロジェクトの.agents/skillsへ、downloadのみで導入させるコピー可能な日本語依頼文を提供。
3. 任意の絶対パス・空白/非ASCII対応、個人用とプロジェクト用の違い、同名重複を自動マージしないこと、既存先上書き拒否を説明。プロジェクト内では利用時の作業位置を適切に選ぶ。
4. 手動操作向けにはmacOS/LinuxとWindows PowerShellで実行可能な標準helper呼出を提示。CODEX_HOMEを尊重、Python3.9+、既存helper存在確認、--method download、--dest、3 --path、--ref指定を正確にする。トークンを表示/ファイル保存せずgh認証から必要な子プロセスにだけ渡すか、既存環境変数を使用し元設定を壊さない。無認証で非公開repoが取得可能と主張しない。
5. リポジトリやSKILLを実プロジェクトへ自動生成する依頼と、スキル自体のインストールを区別する。今回、利用者の任意の既存実プロジェクトは選ばず、試験用projectだけに導入して検証。
6. macOS上で標準helperのdownload方式による非公開repoからの実導入とソース一致・既存ファイル保全・再導入時の上書き拒否を確認。Windows/Linuxの実機やCI成功を偽らない。

## 参照・実効設定

公式: https://learn.chatgpt.com/docs/build-skills （project .agents/skillsを検出）
~/.codex/skills/.system/skill-installer/SKILL.md
~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py
実効設定enabled/delegation/review/persistence/measurement=true,max_agents=3、standard=gpt-5.6-terra/medium、review=gpt-5.6-sol/high。子は再委譲しない。

## 検証・完了

親が一時projectへ非公開repoの指定基点から3スキルをdownload方式で実導入成功。試験ディレクトリは /tmp/harness-install-check-path.txt に記載。トークンはプロセス内のみ、非表示。追加確認と独立レビュー待ち。利用枠と正確な開始時刻は未取得。

### 実施結果

- 実装: a97dbfe58d9f43dd3196ff67d6de9ba5aa0de02e。専用worktreeで文書3件を変更。
- 統合: 0eedfc9655204dbad5fe93a92f020261fb9d3796。mainへfast-forwardし通常push成功。GitHub上のmain SHA一致、PRIVATEを確認。
- clone不要の実導入: macOS/Python3.9.6、標準skill-installer --method download、private repoから基点f3dd51d7の3スキル7ファイル取得。元ソースと一致、既存projectファイル保全、.git未生成、再導入拒否・導入済み内容不変。
- INSTALL.md掲載のshコマンド自体も別の空白/日本語名projectで実行し導入成功。試験先は/tmp/harness-guide-command-path.txtに記録。
- 構文: bash/zsh、両OS例のPython部分を確認。PowerShellのPython本文はASCIIとしパスは引数渡し。Windows/PowerShell本体とLinux実機は未検証。
- 独立レビュー: gpt-5.6-sol/highで全6受入条件PASS。文書以外の実装・設定に変更なし。新規専用インストーラなし。
- 変更: README.md、authoring-skills/README.md、authoring-skills/INSTALL.md。
- 最終統合レビューPASS（3文書が承認済みblobと完全一致、余分な製品差分なし）。利用枠・所要秒は未取得。既存の実プロジェクトと個人用スキル設定には変更なし。
