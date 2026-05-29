import React, { useState } from "react";

const STAGES = ["Prospect", "Lead", "Proposal", "Client", "Inactive"];

const STAGE_COLORS = {
  Prospect: { bg: "#E6F7FB", color: "#0077A8" },
  Lead: { bg: "#FFF3E0", color: "#E65100" },
  Proposal: { bg: "#F3E5F5", color: "#6A1B9A" },
  Client: { bg: "#E8F5E9", color: "#2E7D32" },
  Inactive: { bg: "#F5F5F5", color: "#757575" },
};

const INITIAL_CONTACTS = [
  { id: 1, name: "Harrington Trust", owner: "Andy", type: "Trust", stage: "Client", email: "ht@example.com", phone: "+44 7700 900001", notes: "Long-standing client" },
  { id: 2, name: "Cayman Holdings Ltd", owner: "Sarah", type: "Company", stage: "Prospect", email: "ch@example.com", phone: "+1 345 000 0001", notes: "Initial enquiry received" },
  { id: 3, name: "Vantage Fund SPC", owner: "Andy", type: "Fund", stage: "Proposal", email: "vf@example.com", phone: "+1 305 000 0002", notes: "Proposal sent 20 May" },
  { id: 4, name: "Malta Ventures", owner: "Sarah", type: "Company", stage: "Lead", email: "mv@example.com", phone: "+356 2000 0001", notes: "AML/KYC in progress" },
];

const INITIAL_INTERACTIONS = {
  1: [{ date: "2026-05-10", type: "Call", note: "Annual review discussion" }],
  2: [{ date: "2026-05-20", type: "Email", note: "Sent intro pack" }],
  3: [{ date: "2026-05-22", type: "Meeting", note: "Proposal walkthrough call" }],
  4: [{ date: "2026-05-25", type: "Email", note: "KYC docs requested" }],
};

const Badge = ({ stage }) => (
  <span style={{
    background: STAGE_COLORS[stage]?.bg || "#eee",
    color: STAGE_COLORS[stage]?.color || "#333",
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.3px",
  }}>{stage}</span>
);

const Modal = ({ title, onClose, children }) => (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  }}>
    <div style={{
      background: "#fff", borderRadius: 12, width: 480, maxWidth: "95vw",
      padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a2e" }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const Input = ({ label, value, onChange, type = "text", options }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 5 }}>{label}</label>
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    ) : (
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
    )}
  </div>
);

const inputStyle = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0",
  borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit", color: "#1a1a2e",
};

export default function AffinityCRM() {
  const [contacts, setContacts] = useState(INITIAL_CONTACTS);
  const [interactions, setInteractions] = useState(INITIAL_INTERACTIONS);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterType, setFilterType] = useState("");
  const [modal, setModal] = useState(null); // "add-contact" | "add-interaction" | "edit-contact"
  const [form, setForm] = useState({});

  const filtered = contacts.filter(c =>
    (!search || c.name.toLowerCase().includes(search.toLowerCase()) || c.owner.toLowerCase().includes(search.toLowerCase())) &&
    (!filterStage || c.stage === filterStage) &&
    (!filterType || c.type === filterType)
  );

  const selectedContact = contacts.find(c => c.id === selected);
  const contactInteractions = selected ? (interactions[selected] || []) : [];

  const openAddContact = () => {
    setForm({ name: "", owner: "", type: "Company", stage: "Prospect", email: "", phone: "", notes: "" });
    setModal("add-contact");
  };

  const openEditContact = () => {
    setForm({ ...selectedContact });
    setModal("edit-contact");
  };

  const openAddInteraction = () => {
    setForm({ date: new Date().toISOString().slice(0, 10), type: "Call", note: "" });
    setModal("add-interaction");
  };

  const saveContact = () => {
    if (!form.name) return;
    if (modal === "add-contact") {
      const newContact = { ...form, id: Date.now() };
      setContacts(prev => [...prev, newContact]);
    } else {
      setContacts(prev => prev.map(c => c.id === form.id ? form : c));
    }
    setModal(null);
  };

  const saveInteraction = () => {
    if (!form.note) return;
    setInteractions(prev => ({
      ...prev,
      [selected]: [form, ...(prev[selected] || [])],
    }));
    setModal(null);
  };

  const types = [...new Set(contacts.map(c => c.type))];

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: "#f8f9fc", minHeight: "100vh", color: "#1a1a2e" }}>
      {/* Header */}
      <div style={{ background: "#1a1a2e", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Affinity Core</span>
          <span style={{ color: "#8892b0", fontSize: 14, marginLeft: 12 }}>CRM</span>
        </div>
        <button onClick={openAddContact} style={{
          background: "#4f8ef7", color: "#fff", border: "none", borderRadius: 8,
          padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>+ Add Contact</button>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 57px)" }}>
        {/* Left panel */}
        <div style={{ width: 380, borderRight: "1px solid #e8eaf0", background: "#fff", display: "flex", flexDirection: "column" }}>
          {/* Filters */}
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #f0f2f8" }}>
            <input
              placeholder="Search contacts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, marginBottom: 10 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={filterStage} onChange={e => setFilterStage(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="">All Stages</option>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="">All Types</option>
                {types.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Contact list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 24, color: "#aaa", fontSize: 13, textAlign: "center" }}>No contacts found</div>
            )}
            {filtered.map(c => (
              <div
                key={c.id}
                onClick={() => setSelected(c.id)}
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid #f0f2f8",
                  cursor: "pointer",
                  background: selected === c.id ? "#f0f4ff" : "#fff",
                  borderLeft: selected === c.id ? "3px solid #4f8ef7" : "3px solid transparent",
                  transition: "background 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>{c.type} · {c.owner}</div>
                  </div>
                  <Badge stage={c.stage} />
                </div>
              </div>
            ))}
          </div>

          {/* Summary bar */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid #f0f2f8", background: "#fafbfe", fontSize: 12, color: "#888", display: "flex", gap: 16 }}>
            <span><b style={{ color: "#1a1a2e" }}>{contacts.filter(c => c.stage === "Client").length}</b> Clients</span>
            <span><b style={{ color: "#1a1a2e" }}>{contacts.filter(c => c.stage === "Prospect").length}</b> Prospects</span>
            <span><b style={{ color: "#1a1a2e" }}>{contacts.length}</b> Total</span>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, overflowY: "auto", padding: 28 }}>
          {!selectedContact ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#bbb", fontSize: 14 }}>
              Select a contact to view details
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                <div>
                  <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700 }}>{selectedContact.name}</h2>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Badge stage={selectedContact.stage} />
                    <span style={{ fontSize: 13, color: "#888" }}>{selectedContact.type}</span>
                    <span style={{ fontSize: 13, color: "#888" }}>· {selectedContact.owner}</span>
                  </div>
                </div>
                <button onClick={openEditContact} style={{
                  background: "#f0f4ff", color: "#4f8ef7", border: "none", borderRadius: 8,
                  padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>Edit</button>
              </div>

              {/* Contact details */}
              <div style={{ background: "#fff", borderRadius: 12, padding: 20, marginBottom: 20, border: "1px solid #e8eaf0" }}>
                <h4 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>Contact Details</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    ["Email", selectedContact.email],
                    ["Phone", selectedContact.phone],
                    ["Notes", selectedContact.notes],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: "#aaa", fontWeight: 600, marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 13, color: "#1a1a2e" }}>{val || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Interactions */}
              <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e8eaf0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>Interactions</h4>
                  <button onClick={openAddInteraction} style={{
                    background: "#f0f4ff", color: "#4f8ef7", border: "none", borderRadius: 6,
                    padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>+ Log</button>
                </div>
                {contactInteractions.length === 0 ? (
                  <div style={{ color: "#bbb", fontSize: 13 }}>No interactions yet</div>
                ) : contactInteractions.map((i, idx) => (
                  <div key={idx} style={{ padding: "10px 0", borderBottom: idx < contactInteractions.length - 1 ? "1px solid #f0f2f8" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#4f8ef7" }}>{i.type}</span>
                      <span style={{ fontSize: 12, color: "#aaa" }}>{i.date}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#333" }}>{i.note}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {(modal === "add-contact" || modal === "edit-contact") && (
        <Modal title={modal === "add-contact" ? "Add Contact" : "Edit Contact"} onClose={() => setModal(null)}>
          <Input label="Name" value={form.name || ""} onChange={v => setForm(p => ({ ...p, name: v }))} />
          <Input label="Type" value={form.type || "Company"} onChange={v => setForm(p => ({ ...p, type: v }))} options={["Company", "Trust", "Fund", "Individual"]} />
          <Input label="Stage" value={form.stage || "Prospect"} onChange={v => setForm(p => ({ ...p, stage: v }))} options={STAGES} />
          <Input label="Owner" value={form.owner || ""} onChange={v => setForm(p => ({ ...p, owner: v }))} />
          <Input label="Email" value={form.email || ""} onChange={v => setForm(p => ({ ...p, email: v }))} />
          <Input label="Phone" value={form.phone || ""} onChange={v => setForm(p => ({ ...p, phone: v }))} />
          <Input label="Notes" value={form.notes || ""} onChange={v => setForm(p => ({ ...p, notes: v }))} />
          <button onClick={saveContact} style={{
            width: "100%", background: "#4f8ef7", color: "#fff", border: "none",
            borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 6,
          }}>Save</button>
        </Modal>
      )}

      {modal === "add-interaction" && (
        <Modal title="Log Interaction" onClose={() => setModal(null)}>
          <Input label="Date" value={form.date || ""} onChange={v => setForm(p => ({ ...p, date: v }))} type="date" />
          <Input label="Type" value={form.type || "Call"} onChange={v => setForm(p => ({ ...p, type: v }))} options={["Call", "Email", "Meeting", "Note"]} />
          <Input label="Note" value={form.note || ""} onChange={v => setForm(p => ({ ...p, note: v }))} />
          <button onClick={saveInteraction} style={{
            width: "100%", background: "#4f8ef7", color: "#fff", border: "none",
            borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 6,
          }}>Save</button>
        </Modal>
      )}
    </div>
  );
}
