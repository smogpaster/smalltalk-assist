type Child = Node | string | null | undefined | false
type Props = Record<string, unknown> & {
  class?: string
  on?: Record<string, (event: Event) => void>
}

/** Tiny hyperscript helper: el('button', { class: 'x', on: { click } }, 'Label') */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key === 'on') {
      for (const [name, handler] of Object.entries(value as Record<string, EventListener>)) {
        node.addEventListener(name, handler)
      }
    } else if (key === 'class') {
      node.className = String(value)
    } else if (value === true) {
      node.setAttribute(key, '')
    } else if (value !== false && value !== undefined && value !== null) {
      if (key in node && typeof value !== 'string') (node as unknown as Record<string, unknown>)[key] = value
      else node.setAttribute(key, String(value))
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    node.append(child)
  }
  return node
}

export function selectField<T extends string | number>(
  label: string,
  value: T,
  options: readonly { value: T; label: string }[],
  onChange: (value: T) => void,
): HTMLElement {
  const select = el(
    'select',
    {
      on: {
        change: event => {
          const raw = (event.target as HTMLSelectElement).value
          const match = options.find(o => String(o.value) === raw)
          if (match) onChange(match.value)
        },
      },
    },
    ...options.map(o => el('option', { value: String(o.value), selected: o.value === value }, o.label)),
  )
  return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), select)
}
