import React, { useEffect, useRef, useState } from 'react';
import { api } from './ui.jsx';
import {
  appearances,
  fonts,
  loadPreferences,
  normalizePreferences,
  papers,
  readerSizes,
  rulings,
  savePreferences,
  themes,
  writingDefaults,
  writingSurface,
  writingWidths
} from './preferences-model.mjs';
import './expansion-preferences.css';

export {
  loadPreferences,
  normalizePreferences,
  savePreferences,
  writingDefaults,
  writingSurface
};

function Swatches({ label, options, value, onChange }) {
  return <fieldset className="preference-field">
    <legend>{label}</legend>
    <div className="preference-options">
      {options.map(([id, name, color]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
        {color && <span className="preference-swatch" style={{ '--swatch': color }} aria-hidden="true" />}
        {name}
      </button>)}
    </div>
  </fieldset>;
}

function Slider({ label, value, display, min, max, step, onChange }) {
  return <label className="preference-slider">
    <span>{label}<output>{display}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
  </label>;
}

export function AppearancePreferences({ preferences, update }) {
  return <div className="writing-preferences">
    <Swatches label="界面明暗" options={appearances} value={preferences.appearance} onChange={appearance => update({ appearance })} />
    <Swatches label="主题色" options={themes} value={preferences.theme} onChange={theme => update({ theme })} />
    <p className="muted preference-note">写作纸张在「写作偏好」中单独设置；夜间写作可搭配「夜写」纸张。</p>
  </div>;
}

export function ReaderSizePreference({ preferences, update }) {
  return <select aria-label="阅读字号" value={preferences.readerSize} onChange={event => update({ readerSize: Number(event.target.value) })}>
    {readerSizes.map(size => <option key={size} value={size}>{size} px</option>)}
  </select>;
}

const emptyExpansionFields = { name: '', endpoint: '', model: '', apiKey: '', removeKey: false, reuseKeyFrom: '', thinking: false };
const expansionMutation = { save: 'saving', select: 'switching', remove: 'removing' };
const expansionProgress = { saving: '正在保存配置…', switching: '正在切换配置…', removing: '正在删除配置…', testing: '正在测试连接…' };

function expansionFields(config) {
  const profile = config.profiles?.find(item => item.id === config.activeId);
  return {
    ...emptyExpansionFields, name: profile?.name ?? '', endpoint: config.endpoint ?? '', model: config.model ?? '',
    thinking: isDeepSeekAddress(config.endpoint) && (profile?.thinking ?? config.thinking) === true
  };
}

function expansionAddress(value) {
  try { return new URL(value.trim()).href; }
  catch { return value.trim(); }
}

function isDeepSeekAddress(value) {
  try { return new URL(value).origin === 'https://api.deepseek.com'; }
  catch { return false; }
}

function expansionKeyStatus(hasKey, { addressChanged, apiKey, removeKey, reuseKeyFrom }) {
  if (reuseKeyFrom) return ['待沿用', '保存配置后会沿用所选配置的 Key。'];
  if (apiKey) {
    if (!hasKey) return ['待保存', '保存配置后会使用输入的 Key。'];
    if (addressChanged) return ['待保存', '旧 Key 仍绑定已保存的地址。保存后，新地址使用输入的 Key。'];
    return ['待替换', '当前 Key 仍已保存。保存配置后会使用输入的新 Key。'];
  }
  if (hasKey && removeKey) return ['待移除', '当前 Key 仍已保存。保存配置后会移除。'];
  if (hasKey && addressChanged) return ['待清除', '更换接口地址会清除旧 API Key。新地址需要鉴权时请填写新的 Key。'];
  if (hasKey) return ['已保存', '输入框留空会保留当前 Key。填写新 Key 并保存即可替换。'];
  return ['未保存', '服务需要鉴权时，请填写 Key 并保存配置。'];
}

export function ExpansionPreferences({ purpose = 'expand', kbV2 = false, collapsible = false, onConfigChange = null }) {
  const title = purpose === 'retrieval' ? 'AI 辅助检索' : 'AI 扩写';
  const sectionId = purpose === 'retrieval' ? 'retrieval-settings' : 'expansion-settings';
  const [saved, setSaved] = useState(null);
  const [fields, setFields] = useState(emptyExpansionFields);
  const [status, setStatus] = useState('loading');
  const [notice, setNotice] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [canReset, setCanReset] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const testRequest = useRef(null);

  useEffect(() => {
    let mounted = true;
    api(`${purpose}.config.get`).then(config => {
      if (!mounted) return;
      setSaved(config);
      onConfigChange?.(config);
      setFields(expansionFields(config));
      setStatus('idle');
    }).catch(error => {
      if (!mounted) return;
      setNotice({ error: true, message: `无法读取${title}设置。请重试。` });
      setCanReset(error.code === 'EXPAND_CONFIG_READ');
      setStatus('idle');
    });
    return () => { mounted = false; };
  }, [loadAttempt]);

  useEffect(() => () => {
    const requestId = testRequest.current;
    testRequest.current = null;
    if (requestId) api('request.cancel', { id: requestId }).catch(() => {});
  }, []);

  function change(patch) {
    setFields(current => ({ ...current, ...patch }));
    setConfirmRemove(false);
    setNotice(null);
  }

  async function persist(action, values, feedback) {
    if (status !== 'idle') return;
    setStatus(expansionMutation[action]);
    setNotice(null);
    try {
      const config = await api(`${purpose}.config.${action}`, values);
      setSaved(config);
      onConfigChange?.(config);
      setFields(expansionFields(config));
      setAdding(false);
      setConfirmRemove(false);
      setNotice(feedback(config));
    } catch (error) {
      setNotice({ error: true, message: error.message });
    } finally {
      setStatus('idle');
    }
  }

  function resetConfig() {
    return persist('save', { endpoint: '', model: '', removeKey: true }, () => ({
      message: `已停用${title}，服务配置和 API Key 已清除。`
    }));
  }

  function save(values) {
    return persist('save', values, config => ({
      message: `${title}配置已保存。`,
      detail: config.hasKey ? 'API Key 已保存。输入框已清空以保护密钥，留空会保留已保存的 Key。' : '当前配置未保存 API Key。'
    }));
  }

  function startNewProfile() {
    setFields({ ...emptyExpansionFields, endpoint: saved.endpoint });
    setAdding(true);
    setConfirmRemove(false);
    setNotice(null);
  }

  function discardChanges() {
    setFields(expansionFields(saved));
    setAdding(false);
    setConfirmRemove(false);
    setNotice(null);
  }

  async function test() {
    if (status !== 'idle') return;
    const requestId = crypto.randomUUID();
    testRequest.current = requestId;
    setStatus('testing');
    setNotice(null);
    try {
      await api(`${purpose}.config.test`, { requestId });
      if (testRequest.current === requestId) setNotice({ message: '连接成功，模型已返回测试内容。' });
    } catch (error) {
      if (testRequest.current === requestId) setNotice({
        error: true,
        message: error.message,
        detail: saved.hasKey ? '当前配置仍保留已保存的 API Key。' : '当前配置未保存 API Key。'
      });
    } finally {
      if (testRequest.current === requestId) {
        testRequest.current = null;
        setStatus('idle');
      }
    }
  }

  function cancelTest() {
    const requestId = testRequest.current;
    if (!requestId) return;
    testRequest.current = null;
    setStatus('idle');
    setNotice({ message: '已取消连接测试。' });
    api('request.cancel', { id: requestId }).catch(() => {});
  }

  const busy = status !== 'idle';
  const configured = Boolean(saved?.endpoint && saved?.model);
  const profiles = saved?.profiles ?? [];
  const activeProfile = profiles.find(item => item.id === saved?.activeId);
  const creating = adding || !activeProfile;
  const name = fields.name.trim();
  const endpoint = fields.endpoint.trim();
  const model = fields.model.trim();
  const apiKey = fields.apiKey.trim();
  const deepSeek = isDeepSeekAddress(endpoint);
  const thinking = deepSeek && fields.thinking;
  const addressChanged = Boolean(saved && expansionAddress(endpoint) !== saved.endpoint);
  const thinkingChanged = thinking !== Boolean(activeProfile?.thinking ?? saved?.thinking);
  const changed = Boolean(saved && (adding || name !== (activeProfile?.name ?? '') || addressChanged || model !== saved.model ||
    apiKey || fields.removeKey || fields.reuseKeyFrom || thinkingChanged));
  const canSave = changed && Boolean(endpoint && model);
  const reusableProfiles = creating && saved?.canStoreKey
    ? profiles.filter(item => item.hasKey && item.endpoint === expansionAddress(endpoint)) : [];
  const hasKey = Boolean(!adding && saved?.hasKey);
  const [keyState, keyHelp] = expansionKeyStatus(hasKey, { addressChanged, apiKey, removeKey: fields.removeKey, reuseKeyFrom: fields.reuseKeyFrom });
  const feedback = notice && <p className={`notice expansion-preferences-feedback ${notice.error ? 'danger' : 'success'}`} role={notice.error ? 'alert' : 'status'}>
    <span>{notice.message}</span>
    {notice.detail && <span className="expansion-preferences-feedback-detail">{notice.detail}</span>}
  </p>;
  const body = <>
    <p className="expansion-preferences-description">{purpose === 'retrieval'
      ? (kbV2
        ? '用外部模型理解问题并筛选参考条目。选择「AI 快速」或「AI 深度翻书」时，会发送问题、候选摘录及深度核证所需的参考原文，结果可回到原文核对。'
        : '用外部模型理解问题并筛选知识卡。启用「外部 AI 辅助」时，会发送问题和候选卡摘录，结果可回到原文核对。')
      : '根据选中的提示补写正文。请求会包含当前章所需片段，可选择附上本书的大纲、角色和设定。'}</p>
    {!saved && feedback}
    {!saved && (busy
      ? <p className="inline-status" role="status"><span className="spinner" />{status === 'loading' ? '正在读取配置…' : '正在清除配置…'}</p>
      : <div className="button-row">
        <button type="button" onClick={() => {
          setNotice(null);
          setStatus('loading');
          setLoadAttempt(current => current + 1);
        }}>重试</button>
        {canReset && <button type="button" onClick={resetConfig}>清除损坏的配置</button>}
      </div>)}
    {saved && <form className="expansion-preferences-form" noValidate onSubmit={event => {
      event.preventDefault();
      if (canSave) save({ name, endpoint, model, thinking,
        ...(creating ? { newProfile: true } : { profileId: activeProfile.id }),
        ...(apiKey ? { apiKey } : {}), ...(fields.removeKey ? { removeKey: true } : {}),
        ...(fields.reuseKeyFrom ? { reuseKeyFrom: fields.reuseKeyFrom } : {}) });
    }}>
      {profiles.length > 0 && <div className="expansion-preferences-profiles">
        <label>
          <span>当前启用的模型配置</span>
          <select value={saved.activeId ?? ''} disabled={busy || changed || confirmRemove} onChange={event => persist('select', {
            profileId: event.target.value
          }, config => ({ message: '已切换模型配置。', detail: config.hasKey ? '此配置已保存 API Key。' : '此配置未保存 API Key。' }))}>
            {!saved.activeId && <option value="" disabled>请选择配置</option>}
            {profiles.map(item => <option key={item.id} value={item.id}>{item.name === item.model ? item.name : `${item.name} · ${item.model}`}</option>)}
          </select>
        </label>
        <div className="button-row">
          <button type="button" disabled={busy || changed || confirmRemove} onClick={startNewProfile}>新增配置</button>
          {activeProfile && <button type="button" className="quiet" disabled={busy || changed || confirmRemove}
            onClick={() => { setConfirmRemove(true); setNotice(null); }}>删除当前配置</button>}
        </div>
      </div>}
      {confirmRemove && <div className="notice expansion-preferences-delete">
        <span>删除「{activeProfile.name}」及该配置保存的 Key？</span>
        <div className="button-row">
          <button type="button" disabled={busy} onClick={() => persist('remove', { profileId: activeProfile.id }, config => ({
            message: config.activeId ? '配置已删除，已切换到另一项。' : `配置已删除，${title}已停用。`
          }))}>确认删除</button>
          <button type="button" disabled={busy} onClick={() => setConfirmRemove(false)}>保留配置</button>
        </div>
      </div>}
      {adding && <p className="expansion-preferences-new">正在新增模型配置。保存后会启用新配置。</p>}
      <label>
        <span>配置名称（可选）</span>
        <input value={fields.name} autoComplete="off" disabled={busy} placeholder="留空时使用模型名称"
          onChange={event => change({ name: event.target.value })} />
      </label>
      <label>
        <span>Chat Completions 地址</span>
        <input type="url" value={fields.endpoint} spellCheck={false} autoComplete="off" disabled={busy}
          aria-describedby={sectionId + '-endpoint-help'} placeholder="https://api.deepseek.com/chat/completions"
          onChange={event => change({ endpoint: event.target.value, apiKey: '', removeKey: false, reuseKeyFrom: '', thinking: false })} />
      </label>
      <small id={sectionId + '-endpoint-help'}>填写完整的 OpenAI 兼容接口地址。本机 Ollama 或 LM Studio 可使用 HTTP，远程服务使用 HTTPS。</small>
      <div className="expansion-preferences-fields">
        <label>
          <span>模型名称</span>
          <input value={fields.model} autoComplete="off" spellCheck={false} disabled={busy} placeholder="服务提供的模型名称"
            onChange={event => change({ model: event.target.value })} />
        </label>
        <div className="expansion-preferences-key">
          <label>
            <span>API Key（可选）</span>
            <input type="password" value={fields.apiKey} autoComplete="new-password" spellCheck={false}
              aria-describedby={sectionId + '-key-status'} disabled={busy || !saved.canStoreKey || fields.removeKey || Boolean(fields.reuseKeyFrom)}
              placeholder={hasKey && !addressChanged ? '填写新 Key 可替换' : '需要鉴权时填写'}
              onChange={event => change({ apiKey: event.target.value })} />
          </label>
          <small id={sectionId + '-key-status'} aria-live="polite">
            <span className="expansion-preferences-key-state" data-saved={keyState === '已保存'}>{keyState}</span> {keyHelp}
          </small>
        </div>
      </div>
      {!saved.canStoreKey && <small>系统凭据存储不可用，暂不能保存 API Key。无需 Key 的服务仍可配置。</small>}
      {reusableProfiles.length > 0 && <label>
        <span>沿用同地址的 API Key（可选）</span>
        <select value={fields.reuseKeyFrom} disabled={busy} onChange={event => change({ reuseKeyFrom: event.target.value, apiKey: '' })}>
          <option value="">不沿用</option>
          {reusableProfiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      {hasKey && !addressChanged && <label className="expansion-preferences-check">
        <input type="checkbox" checked={fields.removeKey} disabled={busy}
          onChange={event => change({ removeKey: event.target.checked, apiKey: '' })} /> 保存时移除已存的 API Key
      </label>}
      {deepSeek && <div className="expansion-preferences-mode">
        <label className="expansion-preferences-check">
          <input type="checkbox" checked={thinking} disabled={busy} aria-describedby={sectionId + '-thinking-help'}
            onChange={event => change({ thinking: event.target.checked })} /> 使用思考模式
        </label>
        <small id={sectionId + '-thinking-help'}>连接测试使用简短请求。开启后，{title}可能需要更久。</small>
      </div>}
      <div className="button-row">
        <button type="submit" className="primary" disabled={busy || !canSave}>保存配置</button>
        <button type="button" disabled={busy || !configured || changed || confirmRemove} onClick={test}>测试连接</button>
        {status === 'testing' && <button type="button" onClick={cancelTest}>取消测试</button>}
        {changed && <button type="button" disabled={busy} onClick={discardChanges}>取消修改</button>}
      </div>
      {feedback}
      {busy
        ? <div className="inline-status" role="status"><span className="spinner" />{expansionProgress[status]}</div>
        : <small>{changed ? '保存或取消修改后，可以测试连接或切换配置。' : '连接测试只发送固定测试句。'}</small>}
    </form>}
  </>;
  if (collapsible) {
    return <section className="settings-preferences settings-subcard expansion-preferences is-collapsible" aria-label={title}>
      <h2 className="sr-only" aria-label={title}>{title}</h2>
      <details className="settings-api-details">
        <summary className="settings-api-summary">
          <span>兼容 API 配置（{configured ? '已配置' : '未配置'}）</span>
        </summary>
        <div className="settings-api-details-body">{body}</div>
      </details>
    </section>;
  }
  return <section className="settings-preferences settings-subcard expansion-preferences" aria-label={title}>
    <h2 aria-label={title}>兼容 API 配置</h2>
    {body}
  </section>;
}

export function WritingPreferences({ preferences, update, preview = false }) {
  const { paper, ruling, font, fontSize, lineHeight, width, widthMode, indent } = preferences;
  return <div className="writing-preferences">
    <Swatches label="书写纸张" options={papers} value={paper} onChange={next => update({ paper: next })} />
    <Swatches label="底纹" options={rulings} value={ruling} onChange={next => update({ ruling: next })} />
    <Swatches label="字体" options={fonts.map(([id, label]) => [id, label])} value={font} onChange={next => update({ font: next })} />
    <Swatches label="文稿宽度" options={writingWidths} value={widthMode} onChange={next => update({ widthMode: next })} />
    <div className="preference-sliders">
      <Slider label="写作字号" value={fontSize} display={`${fontSize} px`} min={14} max={28} step={1} onChange={next => update({ fontSize: next })} />
      <Slider label="行距" value={lineHeight} display={`${lineHeight.toFixed(2)} 倍`} min={1.5} max={2.3} step={0.05} onChange={next => update({ lineHeight: next })} />
      {widthMode === 'limit' && <Slider label="最大文稿宽度" value={width} display={`${width} px`} min={560} max={1040} step={20}
        onChange={next => update({ width: next })} />}
    </div>
    <div className="preference-footer">
      <label><input type="checkbox" checked={indent} onChange={event => update({ indent: event.target.checked })} /> 段首缩进两字</label>
      <button className="quiet preference-reset" type="button" onClick={() => update(writingDefaults)}>恢复默认</button>
    </div>
    {preview && <div className="paper-preview" aria-hidden="true" {...writingSurface(preferences)}>
      <p>灯光落在纸上，远处的街道安静下来。</p>
    </div>}
  </div>;
}
