import type { ReactNode } from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

type Pin = { ref: string; shortRef: string; date: string; commitUrl: string };

export default function UpstreamPin(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const pin = siteConfig.customFields?.upstream as Pin | undefined;
  if (!pin) return null;
  return (
    <>
      <a href={pin.commitUrl} target="_blank" rel="noreferrer">
        <code>{pin.shortRef}</code>
      </a>{' '}
      ({pin.date})
    </>
  );
}
