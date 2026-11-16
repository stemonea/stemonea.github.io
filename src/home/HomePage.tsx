import { Bio } from './Bio'
import { Experience } from './Experience'
import { Guestbook } from './Guestbook'
import { Intro } from './Intro'
import { Pins } from './Pins'
import { Slides, type SlideDef } from './Slides'
import './home.css'
import './slides.css'

const SLIDES: SlideDef[] = [
  { id: 'hello', label: 'Hello', className: 'slide-intro', content: <Intro /> },
  { id: 'publications', label: 'Publications', className: 'slide-pins', content: <Pins /> },
  { id: 'guestbook', label: 'Guestbook', className: 'slide-guest', content: <Guestbook /> },
  { id: 'bio', label: 'Biography', className: 'slide-bio', content: <Bio /> },
  { id: 'experience', label: 'Experience', className: 'slide-exp', content: <Experience /> },
]

/** The classic site: the slides under a frame of liquid glass. */
export function HomePage() {
  return <Slides slides={SLIDES} />
}
