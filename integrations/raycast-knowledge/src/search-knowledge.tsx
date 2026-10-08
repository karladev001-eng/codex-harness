import { Action, ActionPanel, Color, Icon, List, Toast, getPreferenceValues, openExtensionPreferences, showToast } from '@raycast/api';
import { useEffect, useRef, useState } from 'react';
import { Card, SearchResult, RequestGate, cardMarkdown, freshnessLabel, freshnessShortLabel, invoke, resolvePaths, safeUrl, search } from './client.cjs';

export default function SearchKnowledge() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [revision, setRevision] = useState(0);
  const gate = useRef(new RequestGate());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; gate.current.invalidate(); }; }, []);
  useEffect(() => {
    const version = gate.current.invalidate();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const paths = await resolvePaths(getPreferenceValues());
        const next = await search(paths, query);
        if (gate.current.current(version)) { setResult(next); setError(''); }
      } catch (e) {
        if (gate.current.current(version)) setError(e instanceof Error ? e.message : 'CLI エラー');
      } finally { if (gate.current.current(version)) setLoading(false); }
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); gate.current.invalidate(); };
  }, [query, revision]);
  async function sync() {
    if (syncing) return;
    setSyncing(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: '同期を確認しています' });
    try {
      const paths = await resolvePaths(getPreferenceValues());
      const freshness = await invoke(paths, 'pull', ['--force']) as SearchResult['freshness'];
      toast.style = freshness.state === 'current' ? Toast.Style.Success : Toast.Style.Failure;
      toast.title = freshness.state === 'current' ? '同期を確認しました' : freshness.state === 'busy' ? '別の同期が実行中です' : freshness.state === 'unconfigured' ? 'Knowledge が未設定です' : '同期確認に失敗しました';
      if (mounted.current) { setResult(previous => previous ? { ...previous, freshness } : previous); setRevision(n => n + 1); }
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = e instanceof Error ? e.message : '同期確認に失敗しました';
      if (mounted.current) setError(toast.title);
    } finally { if (mounted.current) setSyncing(false); }
  }
  function actions(card?: Card) {
    const url = card && safeUrl(card.url);
    return <ActionPanel>
      {url && <Action.OpenInBrowser title="元ページを開く" url={url} />}
      {url && <Action.CopyToClipboard title="URLをコピー" content={url} shortcut={{ modifiers: ['cmd'], key: 'c' }} />}
      <Action title="手動で同期を確認" icon={Icon.ArrowClockwise} onAction={sync} shortcut={{ modifiers: ['cmd'], key: 'r' }} />
      <Action title="拡張設定を開く" icon={Icon.Gear} onAction={openExtensionPreferences} />
    </ActionPanel>;
  }
  return <List isLoading={loading || syncing} isShowingDetail searchText={query} filtering={false}
    searchBarPlaceholder="本文・説明・メモ・タグを検索" onSearchTextChange={text => { gate.current.invalidate(); setQuery(text); }}
    navigationTitle="保存資料を検索">
    <List.Section title={query ? '検索結果' : '最近の資料'} subtitle={error ? 'CLI エラー' : freshnessShortLabel(result)}>
      {(result?.results || []).map(card => <List.Item key={card.capture_id} id={card.capture_id} title={card.title || '無題'}
        subtitle={card.kind} icon={safeUrl(card.url) ? Icon.Document : { source: Icon.Warning, tintColor: Color.Orange }}
        actions={actions(card)} detail={<List.Item.Detail markdown={cardMarkdown(card)} metadata={<List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="出所" text={card.url} />
          <List.Item.Detail.Metadata.Label title="取得日時" text={card.captured_at} />
          <List.Item.Detail.Metadata.Label title="説明の状態" text={card.analysis_state} />
          <List.Item.Detail.Metadata.Label title="同期" text={error || freshnessLabel(result)} />
          <List.Item.Detail.Metadata.TagList title="タグ">{card.tags.map((tag, index) => <List.Item.Detail.Metadata.TagList.Item key={index} text={tag} />)}</List.Item.Detail.Metadata.TagList>
        </List.Item.Detail.Metadata>} />} />)}
    </List.Section>
    <List.EmptyView title={error ? 'CLI を確認してください' : loading ? '資料を検索しています' : result?.freshness.state === 'unconfigured' ? 'Knowledge が未設定です' : result?.commit ? '一致する資料はありません' : '同期済み資料はありません'}
      description={error || freshnessLabel(result)} icon={Icon.Document} actions={actions()} />
  </List>;
}
