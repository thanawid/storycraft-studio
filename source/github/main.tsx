import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { StudioGate } from '../components/studio-gate';
import '../app/studio.css';

class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="startup-error"><h1>เปิดสตูดิโอไม่สำเร็จ</h1><p>ลองรีเฟรชหน้าเว็บ ข้อมูลโปรเจกต์ในอุปกรณ์จะไม่ถูกลบ</p><button className="primary" onClick={() => window.location.reload()}>เปิดสตูดิโออีกครั้ง</button></main>;
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<AppBoundary><StudioGate /></AppBoundary>);
