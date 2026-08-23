import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const details = location.pathname === "/details";
function App() {
  return <main data-page={details ? "details" : "home"}>
    <nav className="flex"><span className="mark">FPG</span><span>Release evidence</span></nav>
    <section className="hero">
      <p className="kicker">FRONTEND PROMOTION GUARD</p>
      <h1>{details ? "Evidence before promotion." : "Healthy is not the same as correct."}</h1>
      <p className="intro">A release gate that checks the CSS users receive and the layout browsers actually compute.</p>
    </section>
    <section className="status-grid grid">
      {[['01','CSS semantics'],['02','Computed styles'],['03','Visual diff'],['04','Safe rollback']].map(([number,label]) => <article key={number}><span>{number}</span><strong>{label}</strong><small>verified</small></article>)}
    </section>
    <footer className="flex"><span>Candidate isolated</span><span>Baseline protected</span><span className="hidden">Hidden marker</span></footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
