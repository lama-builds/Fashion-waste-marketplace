import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const STATUSES = ['available', 'reserved', 'sold'];

export default function MyListings() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null); // null = still loading
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState(null);

  // Handles a failed call: not logged in -> go to login, otherwise show the message.
  function fail(err) {
    if (err.status === 401) navigate('/login');
    else setError(err.message);
  }

  useEffect(() => {
    api('/listings/mine').then((d) => setItems(d.items)).catch(fail);
  }, []);

  async function setStatus(id, status) {
    setError('');
    try {
      const updated = await api(`/listings/${id}`, { method: 'PATCH', body: { status } });
      setItems((list) => list.map((l) => (l.id === id ? { ...l, status: updated.status } : l)));
    } catch (err) { fail(err); }
  }

  async function remove(id) {
    setError('');
    try {
      await api(`/listings/${id}`, { method: 'DELETE' });
      setItems((list) => list.filter((l) => l.id !== id));
      setConfirmId(null);
    } catch (err) { fail(err); }
  }

  if (items === null && !error) return <p>Loading your listings…</p>;
  return (
    <main>
      <h1>My listings</h1>
      {error && <p role="alert">{error}</p>}
      {items && items.length === 0 && <p>You have not created any listings yet.</p>}
      {items && items.map((l) => (
        <article key={l.id}>
          <h3>{l.title}</h3>
          <p>{l.quantity} {l.unit} · {l.city} · {l.is_free ? 'Free' : `EGP ${l.price}`}</p>
          {STATUSES.map((s) => (
            <button key={s} aria-pressed={l.status === s} onClick={() => setStatus(l.id, s)}>{s}</button>
          ))}
          {confirmId === l.id ? (
            <>
              <span>Delete this listing?</span>
              <button onClick={() => remove(l.id)}>Yes, delete</button>
              <button onClick={() => setConfirmId(null)}>Keep</button>
            </>
          ) : (
            <button onClick={() => setConfirmId(l.id)}>Delete</button>
          )}
        </article>
      ))}
    </main>
  );
}
