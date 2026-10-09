import type { ReactNode } from 'react'
import styles from './Card.module.css'

interface CardProps {
  title?: string
  children: ReactNode
}

export function Card({ title, children }: CardProps) {
  return (
    <section className={styles.card}>
      {title && <h3 className={styles.title}>{title}</h3>}
      <div className={styles.body}>{children}</div>
    </section>
  )
}
