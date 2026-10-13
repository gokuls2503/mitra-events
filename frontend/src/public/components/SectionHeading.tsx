import clsx from 'clsx'

import { LotusDivider } from './Brand'
import { Reveal } from './Reveal'

interface Props {
  eyebrow?: string
  title: string
  intro?: string
  align?: 'center' | 'left'
  as?: 'h1' | 'h2'
}

export function SectionHeading({ eyebrow, title, intro, align = 'center', as: Tag = 'h2' }: Props) {
  const center = align === 'center'
  return (
    <Reveal className={clsx('mb-10 max-w-2xl', center && 'mx-auto text-center')}>
      {eyebrow && <p className="font-caps text-xs font-semibold tracking-[0.3em] text-gold-700 uppercase sm:text-sm">{eyebrow}</p>}
      <Tag className="mt-2 text-4xl leading-tight font-semibold text-brand-800 sm:text-5xl">{title}</Tag>
      {center && <LotusDivider className="mt-4" />}
      {intro && <p className="mt-4 text-base text-stone-600 sm:text-lg">{intro}</p>}
    </Reveal>
  )
}
