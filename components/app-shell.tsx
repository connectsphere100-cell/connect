'use client';
import { Sidebar } from './sidebar';
import { Bell, Search, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
export function AppShell({children,title='Workspace'}:{children:React.ReactNode;title?:string}){const router=useRouter();async function logout(){await fetch('/api/auth/logout',{method:'POST'});router.push('/login');}return <div className="app-shell"><Sidebar/><main className="main"><header className="topbar"><div className="row"><span style={{fontWeight:700,fontSize:14}}>{title}</span></div><div className="row"><Search size={17} color="#85899a"/><Bell size={18} color="#85899a"/><button className="btn ghost" onClick={logout}><LogOut size={14}/>Sign out</button></div></header>{children}</main></div>}
