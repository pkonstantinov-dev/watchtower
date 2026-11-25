import assert from 'node:assert/strict'
import { unansweredMention } from './mentions.js'

const ME = 'me'
const body = (...mentionIds) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: mentionIds.map(id => ({ type: 'mention', attrs: { id } })) }],
})
const comment = (id, author, ...mentionIds) => ({ id, author: { accountId: author }, body: body(...mentionIds) })

assert.equal(unansweredMention([], ME), null)
assert.equal(unansweredMention([comment(1, 'ann', 'bob')], ME), null)
assert.equal(unansweredMention([comment(1, 'ann', ME)], ME).id, 1)
assert.equal(unansweredMention([comment(1, 'ann', ME), comment(2, ME)], ME), null)
assert.equal(unansweredMention([comment(1, 'ann', ME), comment(2, 'bob')], ME).id, 1)
assert.equal(unansweredMention([comment(1, 'ann', ME), comment(2, ME), comment(3, 'bob', 'x', ME)], ME).id, 3)
assert.equal(unansweredMention([comment(1, ME, ME)], ME), null)

console.log('mentions ok')
