import { unansweredMention } from './mentions.js'

export const TYPES = ['Story', 'Bug', 'Task', 'Spike']
const SPRINT_SCHEMA = 'com.pyxis.greenhopper.jira:gh-sprint'

export const normalizeSite = input => input.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase()

export function createJira({ site, email, token }) {
  const headers = { 'x-jira-site': site, Authorization: `Basic ${btoa(`${email}:${token}`)}` }

  async function get(path, params = {}) {
    const res = await fetch(`/rest/api/3/${path}?${new URLSearchParams(params)}`, { headers })
    if (res.status === 401) throw new Error('Jira rejected the email or API token.')
    if (!res.ok) throw new Error(`Jira ${res.status}: ${await res.text()}`)
    return res.json()
  }

  async function search(jql, fields) {
    const issues = []
    let nextPageToken
    do {
      const page = await get('search/jql', { jql, fields: fields.filter(Boolean).join(','), maxResults: 100, ...(nextPageToken && { nextPageToken }) })
      issues.push(...page.issues)
      nextPageToken = page.nextPageToken
    } while (nextPageToken)
    return issues
  }

  async function connect() {
    const [me, fields] = await Promise.all([get('myself'), get('field')])
    return {
      displayName: me.displayName,
      sprintField: fields.find(f => f.schema?.custom === SPRINT_SCHEMA)?.id ?? null,
    }
  }

  async function spaces() {
    const all = []
    for (let startAt = 0, isLast = false; !isLast; startAt = all.length) {
      const page = await get('project/search', { startAt, maxResults: 100, orderBy: 'name' })
      all.push(...page.values)
      isLast = page.isLast || !page.values.length
    }
    return all.map(p => ({ key: p.key, name: p.name }))
  }

  let accountIdPromise

  function myAccountId() {
    accountIdPromise ??= get('myself').then(
      user => user.accountId,
      e => {
        accountIdPromise = null
        throw e
      },
    )
    return accountIdPromise
  }

  async function loadIssues(space, sprintField, includeDone, withMentions) {
    const [accountId, mySubtasks] = await Promise.all([
      myAccountId(),
      search(`project = "${space}" AND issuetype in subTaskIssueTypes() AND assignee = currentUser()`, ['parent']),
    ])
    const parentKeys = [...new Set(mySubtasks.map(i => i.fields.parent.key))]
    const involved = parentKeys.length ? `(key in (${parentKeys}) OR assignee = currentUser())` : 'assignee = currentUser()'
    const doneClause = includeDone ? '' : ' AND statusCategory != Done'
    const issues = await search(
      `project = "${space}" AND issuetype in (${TYPES}) AND ${involved}${doneClause} ORDER BY Rank`,
      ['summary', 'status', 'issuetype', 'assignee', sprintField],
    )
    if (!issues.length) return { issues: [], mentions: {}, accountId }

    const keys = issues.map(s => s.key)
    const [subtasks, mentioned] = await Promise.all([
      search(`parent in (${keys}) ORDER BY key`, ['summary', 'status', 'issuetype', 'assignee', 'parent']),
      withMentions ? search(`comment ~ "${accountId}" AND (key in (${keys}) OR parent in (${keys}))`, ['comment']) : [],
    ])
    const mentions = Object.fromEntries(
      mentioned
        .map(i => [i.key, unansweredMention(i.fields.comment.comments, accountId)])
        .filter(([, comment]) => comment),
    )
    return {
      accountId,
      mentions,
      issues: issues.map(s => ({ ...s, subtasks: subtasks.filter(t => t.fields.parent.key === s.key) })),
    }
  }

  return { connect, spaces, loadIssues }
}
