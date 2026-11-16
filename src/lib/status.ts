/** How each status looks: icon and colour classes. Labels and keys stay in shared/types. */
import type { Component } from 'vue';
import {
  ArchiveIcon,
  CalendarCheckIcon,
  CircleDotIcon,
  CircleXIcon,
  GhostIcon,
  HandshakeIcon,
  MessagesSquareIcon,
  PartyPopperIcon,
  SendIcon,
  StarIcon,
  ThumbsDownIcon,
} from '@lucide/vue';
import { STATUSES, type Status } from '../../shared/types';

export interface StatusMeta {
  id: Status;
  label: string;
  key: string;
  icon: Component;
  /** Soft background + text colour, for badges and the active segment. */
  tone: string;
  /** Solid dot colour. */
  dot: string;
  /** Faint wash of the status colour, for column backgrounds. */
  tint: string;
}

// Each status has its own pastel (tokens --st-<id>-bg / -fg / -dot in styles.css). Class names are
// spelled out in full so Tailwind can find them.
const LOOK: Record<Status, Pick<StatusMeta, 'icon' | 'tone' | 'dot' | 'tint'>> = {
  new: { icon: CircleDotIcon, tone: 'bg-(--st-new-bg) text-(--st-new-fg)', dot: 'bg-(--st-new-dot)', tint: 'bg-(--st-new-bg)/75' },
  interested: { icon: StarIcon, tone: 'bg-(--st-interested-bg) text-(--st-interested-fg)', dot: 'bg-(--st-interested-dot)', tint: 'bg-(--st-interested-bg)/75' },
  applied: { icon: SendIcon, tone: 'bg-(--st-applied-bg) text-(--st-applied-fg)', dot: 'bg-(--st-applied-dot)', tint: 'bg-(--st-applied-bg)/75' },
  talking: { icon: MessagesSquareIcon, tone: 'bg-(--st-talking-bg) text-(--st-talking-fg)', dot: 'bg-(--st-talking-dot)', tint: 'bg-(--st-talking-bg)/75' },
  interview: { icon: CalendarCheckIcon, tone: 'bg-(--st-interview-bg) text-(--st-interview-fg)', dot: 'bg-(--st-interview-dot)', tint: 'bg-(--st-interview-bg)/75' },
  offer: { icon: HandshakeIcon, tone: 'bg-(--st-offer-bg) text-(--st-offer-fg)', dot: 'bg-(--st-offer-dot)', tint: 'bg-(--st-offer-bg)/75' },
  accepted: { icon: PartyPopperIcon, tone: 'bg-(--st-accepted-bg) text-(--st-accepted-fg)', dot: 'bg-(--st-accepted-dot)', tint: 'bg-(--st-accepted-bg)/75' },
  passed: { icon: ThumbsDownIcon, tone: 'bg-(--st-passed-bg) text-(--st-passed-fg)', dot: 'bg-(--st-passed-dot)', tint: 'bg-(--st-passed-bg)/75' },
  rejected: { icon: CircleXIcon, tone: 'bg-(--st-rejected-bg) text-(--st-rejected-fg)', dot: 'bg-(--st-rejected-dot)', tint: 'bg-(--st-rejected-bg)/75' },
  ghosted: { icon: GhostIcon, tone: 'bg-(--st-ghosted-bg) text-(--st-ghosted-fg)', dot: 'bg-(--st-ghosted-dot)', tint: 'bg-(--st-ghosted-bg)/75' },
  closed: { icon: ArchiveIcon, tone: 'bg-(--st-closed-bg) text-(--st-closed-fg)', dot: 'bg-(--st-closed-dot)', tint: 'bg-(--st-closed-bg)/75' },
};

export const STATUS_META: StatusMeta[] = STATUSES.map((s) => ({ ...s, ...LOOK[s.id] }));
export const statusMeta = (id: Status): StatusMeta => STATUS_META.find((s) => s.id === id)!;
