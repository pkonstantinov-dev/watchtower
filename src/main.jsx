import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createJira, normalizeSite, TYPES } from './jira.js'
import { FEATURES, withDefaults } from './features.js'

const TOKEN_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens'
const REFRESH_MS = 5 * 60 * 1000
const STATE_ORDER = { active: 0, future: 1, closed: 2 }

function readStored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

const statusMap = subs => Object.fromEntries(subs.map(t => [t.key, t.fields.status.name]))
const shortDate = d => d && new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function sprintOf(issue, sprintField) {
  const sprints = issue.fields[sprintField] ?? []
  return sprints.find(s => s.state === 'active')
    ?? sprints.filter(s => s.state === 'future').sort((a, b) => a.id - b.id)[0]
    ?? sprints.at(-1)
    ?? null
}

function groupBySprint(issues, sprintField) {
  const groups = new Map()
  for (const issue of issues) {
    const sprint = sprintOf(issue, sprintField)
    const id = sprint?.id ?? 'backlog'
    if (!groups.has(id)) groups.set(id, { id, sprint, issues: [] })
    groups.get(id).issues.push(issue)
  }
  const rank = g => (g.sprint ? [STATE_ORDER[g.sprint.state], g.sprint.id] : [3, 0])
  return [...groups.values()].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)]
    return ra[0] - rb[0] || ra[1] - rb[1]
  })
}

function IssueLink({ site, issueKey }) {
  return <a href={`https://${site}/browse/${issueKey}`} target="_blank" rel="noreferrer">{issueKey}</a>
}

function MentionDot({ site, issueKey, comment }) {
  if (!comment) return null
  const label = `${comment.author.displayName} mentioned you on ${issueKey}, ${new Date(comment.created).toLocaleString()}`
  return (
    <a
      className="mention-dot"
      href={`https://${site}/browse/${issueKey}?focusedCommentId=${comment.id}`}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
    />
  )
}

function Status({ status }) {
  return <span className={`status ${status.statusCategory.key}`}>{status.name}</span>
}

function SprintHeader({ sprint, count }) {
  if (!sprint) return <>Backlog <small>{count}</small></>
  const dates = [shortDate(sprint.startDate), shortDate(sprint.endDate)].filter(Boolean).join(' – ')
  return (
    <>
      {sprint.name} <span className={`sprint-state ${sprint.state}`}>{sprint.state}</span>
      <small>{[dates, `${count} items`].filter(Boolean).join(' · ')}</small>
    </>
  )
}

function FeatureDrawer({ features, onChange }) {
  const dialog = useRef(null)
  const close = () => dialog.current.close()
  return (
    <>
      <button className="burger" onClick={() => dialog.current.showModal()} aria-label="Features" title="Features">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <dialog ref={dialog} className="drawer" aria-labelledby="features-title" onClick={e => e.target === dialog.current && close()}>
        <div>
          <div className="drawer-head">
            <span id="features-title">Features</span>
            <button className="link" onClick={close} aria-label="Close features">✕</button>
          </div>
          {FEATURES.map(f => (
            <label key={f.id} className="feature">
              <input type="checkbox" checked={features[f.id]} onChange={e => onChange({ ...features, [f.id]: e.target.checked })} />
              <span>
                <strong>{f.name}</strong>
                <small>{f.description}</small>
              </span>
            </label>
          ))}
        </div>
      </dialog>
    </>
  )
}

function Login({ onConnect }) {
  const [form, setForm] = useState({ site: '', email: '', token: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const field = name => ({ name, value: form[name], required: true, onChange: e => setForm({ ...form, [name]: e.target.value }) })

  const submit = async e => {
    e.preventDefault()
    const auth = { ...form, site: normalizeSite(form.site), email: form.email.trim(), token: form.token.trim() }
    setBusy(true)
    setError(null)
    try {
      onConnect({ ...auth, ...(await createJira(auth).connect()) })
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h1>Connect to Jira</h1>
      <label>
        Jira site
        <input {...field('site')} placeholder="your-company.atlassian.net" autoFocus />
      </label>
      <label>
        Email
        <input {...field('email')} type="email" autoComplete="username" />
      </label>
      <label>
        API token
        <input {...field('token')} type="password" autoComplete="current-password" />
        <small>
          Create one at <a href={TOKEN_URL} target="_blank" rel="noreferrer">id.atlassian.com</a>. It is kept in this browser only.
        </small>
      </label>
      {error && <p className="error">{error}</p>}
      <button className="accent" disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
    </form>
  )
}

function SpacePicker({ auth, current, onPick, onCancel, onSignOut }) {
  const [spaces, setSpaces] = useState(null)
  const [key, setKey] = useState(current?.key ?? '')
  const [error, setError] = useState(null)

  useEffect(() => {
    createJira(auth).spaces().then(setSpaces, e => setError(e.message))
  }, [auth])

  const submit = e => {
    e.preventDefault()
    onPick(spaces.find(s => s.key === key))
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h1>Choose a space</h1>
      <p className="muted">Signed in to {auth.site} as {auth.displayName}.</p>
      {error && <p className="error">{error}</p>}
      <select value={key} onChange={e => setKey(e.target.value)} required disabled={!spaces} autoFocus>
        <option value="" disabled>{spaces ? 'Select a space' : 'Loading spaces…'}</option>
        {spaces?.map(s => <option key={s.key} value={s.key}>{s.name} ({s.key})</option>)}
      </select>
      <div className="actions">
        <button className="accent" disabled={!key || !spaces}>Watch</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
        <button type="button" className="link" onClick={onSignOut}>Sign out</button>
      </div>
    </form>
  )
}

function Root() {
  const [auth, setAuth] = useState(() => readStored('auth', null))
  const [space, setSpace] = useState(() => readStored('space', null))
  const [picking, setPicking] = useState(false)

  useEffect(() => writeStored('auth', auth), [auth])
  useEffect(() => writeStored('space', space), [space])

  const signOut = () => {
    setAuth(null)
    setSpace(null)
    setPicking(false)
  }
  const pick = next => {
    setSpace(next)
    setPicking(false)
  }

  if (!auth) return <Login onConnect={setAuth} />
  if (!space || picking) {
    return <SpacePicker auth={auth} current={space} onPick={pick} onCancel={space && (() => setPicking(false))} onSignOut={signOut} />
  }
  return <Board key={`${auth.site}/${space.key}`} auth={auth} space={space} onSwitchSpace={() => setPicking(true)} onSignOut={signOut} />
}

function Board({ auth, space, onSwitchSpace, onSignOut }) {
  const jira = useMemo(() => createJira(auth), [auth])
  const [data, setData] = useState({ issues: [], mentions: {}, accountId: null })
  const [showDone, setShowDone] = useState(false)
  const [types, setTypes] = useState(() => readStored('types', TYPES))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [seen, setSeen] = useState(() => readStored('seen', {}))
  const [collapsed, setCollapsed] = useState(() => readStored('collapsed', []))
  const [focused, setFocused] = useState(() => readStored('focused', []))
  const [focusMode, setFocusMode] = useState(() => readStored('focusMode', false))
  const [features, setFeatures] = useState(() => withDefaults(readStored('features', {})))

  const latestRequest = useRef(0)
  const lastLoadAt = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++latestRequest.current
    lastLoadAt.current = Date.now()
    setLoading(true)
    try {
      const next = await jira.loadIssues(space.key, auth.sprintField, showDone, features.mentions)
      if (request !== latestRequest.current) return
      setData(next)
      setSeen(prev => ({ ...statusMap(next.issues.flatMap(s => s.subtasks)), ...prev }))
      setUpdatedAt(new Date())
      setError(null)
    } catch (e) {
      if (request === latestRequest.current) setError(e.message)
    } finally {
      if (request === latestRequest.current) setLoading(false)
    }
  }, [jira, space.key, auth.sprintField, showDone, features.mentions])

  useEffect(() => {
    refresh()
    const refreshIfStale = () => {
      if (!document.hidden && Date.now() - lastLoadAt.current >= REFRESH_MS) refresh()
    }
    const id = setInterval(refreshIfStale, REFRESH_MS)
    document.addEventListener('visibilitychange', refreshIfStale)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', refreshIfStale)
    }
  }, [refresh])

  useEffect(() => writeStored('seen', seen), [seen])
  useEffect(() => writeStored('types', types), [types])
  useEffect(() => writeStored('collapsed', collapsed), [collapsed])
  useEffect(() => writeStored('focused', focused), [focused])
  useEffect(() => writeStored('focusMode', focusMode), [focusMode])
  useEffect(() => writeStored('features', features), [features])

  const isMine = issue => issue.fields.assignee?.accountId === data.accountId
  const assigneeName = issue => (isMine(issue) ? 'You' : issue.fields.assignee?.displayName ?? 'Unassigned')
  const isChanged = t => t.key in seen && seen[t.key] !== t.fields.status.name
  const markSeen = subs => setSeen(prev => ({ ...prev, ...statusMap(subs) }))
  const toggleIn = (setter, value) => setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]))
  const toggleType = type => toggleIn(setTypes, type)
  const toggleCollapsed = key => toggleIn(setCollapsed, key)
  const toggleFocused = key => toggleIn(setFocused, key)

  const focusOn = features.focus && focusMode
  const visible = focusOn
    ? data.issues.filter(i => focused.includes(i.key))
    : data.issues.filter(i => types.includes(i.fields.issuetype.name))
  const changedSubs = visible.flatMap(s => s.subtasks).filter(isChanged)
  const subtaskMentions = issue => issue.subtasks.filter(t => data.mentions[t.key]).length
  const mentionCount = visible.flatMap(i => [i, ...i.subtasks]).filter(i => data.mentions[i.key]).length
  const groups = groupBySprint(visible, auth.sprintField)

  return (
    <>
      <header>
        <FeatureDrawer features={features} onChange={setFeatures} />
        <h1>{space.name} work I'm on</h1>
        {features.focus && (
          <button className={focusMode ? 'accent' : ''} aria-pressed={focusMode} onClick={() => setFocusMode(on => !on)}>
            ★ Focus{focused.length > 0 && ` · ${focused.length}`}
          </button>
        )}
        <div className={focusOn ? 'types disabled' : 'types'}>
          {TYPES.map(type => (
            <label key={type} className={types.includes(type) ? 'chip on' : 'chip'}>
              <input type="checkbox" checked={types.includes(type)} onChange={() => toggleType(type)} />
              {type} <small>{data.issues.filter(i => i.fields.issuetype.name === type).length}</small>
            </label>
          ))}
        </div>
        <label>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show done
        </label>
        <button onClick={refresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        {changedSubs.length > 0 && (
          <button className="accent" onClick={() => markSeen(changedSubs)}>Mark {changedSubs.length} changes seen</button>
        )}
        {mentionCount > 0 && (
          <span className="mention-count">{mentionCount} unanswered {mentionCount === 1 ? 'mention' : 'mentions'}</span>
        )}
        {updatedAt && <small>Updated {updatedAt.toLocaleTimeString()}</small>}
        <span className="account">
          <button onClick={onSwitchSpace}>Switch space</button>
          <button className="link" onClick={onSignOut} title={`${auth.displayName} on ${auth.site}`}>Sign out</button>
        </span>
      </header>

      {error && <pre className="error">{error}</pre>}
      {!loading && !error && !visible.length && (
        <p className="empty">{focusOn ?'Nothing in focus. Turn focus off and pick items with ☆.' : 'Nothing matches.'}</p>
      )}

      {groups.map(group => (
        <details key={group.id} className="sprint" open={group.sprint?.state !== 'closed'}>
          <summary><SprintHeader sprint={group.sprint} count={group.issues.length} /></summary>
          {[...group.issues]
            .sort((a, b) => b.subtasks.some(isChanged) - a.subtasks.some(isChanged))
            .map(issue => {
              const issueChanged = issue.subtasks.some(isChanged)
              const isCollapsed = collapsed.includes(issue.key)
              const doneCount = issue.subtasks.filter(t => t.fields.status.statusCategory.key === 'done').length
              return (
                <section key={issue.key} className={issueChanged ? 'card changed' : 'card'}>
                  <h2 onClick={e => e.target.closest('a, button') || toggleCollapsed(issue.key)}>
                    <button
                      className="toggle"
                      aria-expanded={!isCollapsed}
                      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${issue.key} subtasks`}
                      onClick={() => toggleCollapsed(issue.key)}
                    >
                      {isCollapsed ? '▸' : '▾'}
                    </button>
                    <span className={`type ${issue.fields.issuetype.name.toLowerCase()}`}>{issue.fields.issuetype.name}</span>
                    <IssueLink site={auth.site} issueKey={issue.key} />
                    <MentionDot site={auth.site} issueKey={issue.key} comment={data.mentions[issue.key]} />
                    {isCollapsed && subtaskMentions(issue) > 0 && (
                      <span
                        className="mention-ring"
                        title={`${subtaskMentions(issue)} unanswered in subtasks`}
                        aria-label={`${subtaskMentions(issue)} unanswered mentions in subtasks`}
                      />
                    )}
                    <span className="summary">{issue.fields.summary}</span>
                    {features.focus && (
                      <button
                        className={focused.includes(issue.key) ? 'star on' : 'star'}
                        aria-pressed={focused.includes(issue.key)}
                        aria-label={`${focused.includes(issue.key) ? 'Remove' : 'Add'} ${issue.key} ${focused.includes(issue.key) ? 'from' : 'to'} focus`}
                        onClick={() => toggleFocused(issue.key)}
                      >
                        {focused.includes(issue.key) ? '★' : '☆'}
                      </button>
                    )}
                    {issue.subtasks.length > 0 && (
                      <span className="progress">{doneCount}/{issue.subtasks.length} done</span>
                    )}
                    <span className={isMine(issue) ? 'owner mine' : 'owner'}>{assigneeName(issue)}</span>
                    <Status status={issue.fields.status} />
                    {issueChanged && <button onClick={() => markSeen(issue.subtasks)}>Seen</button>}
                  </h2>
                  {isCollapsed ? null : issue.subtasks.length > 0 ? (
                    <table>
                      <tbody>
                        {issue.subtasks.map(t => (
                          <tr key={t.key} className={[isMine(t) && 'mine', isChanged(t) && 'changed'].filter(Boolean).join(' ')}>
                            <td className="subtype">{t.fields.issuetype.name}</td>
                            <td>
                              <IssueLink site={auth.site} issueKey={t.key} /> <MentionDot site={auth.site} issueKey={t.key} comment={data.mentions[t.key]} /> {t.fields.summary}
                            </td>
                            <td className="assignee">{assigneeName(t)}</td>
                            <td className="state">
                              <Status status={t.fields.status} />
                              {isChanged(t) && <span className="was">was {seen[t.key]}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="no-subtasks">No subtasks</p>
                  )}
                </section>
              )
            })}
        </details>
      ))}
    </>
  )
}

createRoot(document.getElementById('root')).render(<Root />)
