import type { AnchorHTMLAttributes } from 'react';

// The shared account form needs ordinary local navigation, not a server router.
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}
