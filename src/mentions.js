const mentionsUser = (node, accountId) =>
  (node?.type === 'mention' && node.attrs?.id === accountId) || (node?.content ?? []).some(n => mentionsUser(n, accountId))

export function unansweredMention(comments, accountId) {
  let pending = null
  for (const comment of comments) {
    if (comment.author?.accountId === accountId) pending = null
    else if (mentionsUser(comment.body, accountId)) pending = comment
  }
  return pending
}
