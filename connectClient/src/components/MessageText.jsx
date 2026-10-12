const EMOJI_RE = /(\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*)/gu
const ONLY_EMOJI_RE = /^(?:\s*(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*)\s*)+$/u

export default function MessageText({ content }) {
  const parts = content.split(EMOJI_RE)
  const emojiCount = content.match(EMOJI_RE)?.length ?? 0
  const jumbo = ONLY_EMOJI_RE.test(content) && emojiCount <= 10

  return (
    <p className={jumbo ? 'chat-text is-jumbo' : 'chat-text'}>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <span className="chat-emoji" key={i}>{part}</span>
          : part,
      )}
    </p>
  )
}