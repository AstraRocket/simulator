import type { ReactNode } from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export default function AppVersion(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const version = siteConfig.customFields?.appVersion as string | undefined;
  return version ? <>v{version}</> : null;
}
