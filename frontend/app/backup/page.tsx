import Link from 'next/link';
export default function BackupInformation(){return <main style={{maxWidth:720,margin:'32px auto',padding:24,lineHeight:1.7}}>
<h1>Sach Sports Backup</h1><p>A private backup utility for the Sach Sports dashboard administrator. It copies saved sports statistics, ranking snapshots and prediction-history files from the dashboard’s Railway storage to a designated folder in the administrator’s Google Drive.</p>
<p>Google authorization is used to create and manage backup files. This utility is not a public Google Drive browser or a dashboard-user sign-in service.</p>
<p>Only the administrator should authorize this utility. Backup completion is verified separately from authorization.</p>
<p><Link href="/backup/privacy">Privacy policy</Link> · <Link href="/backup/terms">Terms of use</Link></p>
<p>Contact: <a href="mailto:sachsportsplatform@gmail.com">sachsportsplatform@gmail.com</a></p></main>}
