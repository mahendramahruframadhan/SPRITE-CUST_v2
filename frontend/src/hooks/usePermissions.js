import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getPerms } from '../lib/api.js';
import { getJSON, set as storageSet } from '../lib/storage.js';
// Data murni dipisah ke config/permissions.js agar unit test node --test bisa
// mengimpornya tanpa menarik AuthContext (JSX tidak bisa dibaca node langsung).
export { DEFAULT_PERMS, ROUTE_PERM, menuPerm } from '../config/permissions.js';
import { DEFAULT_PERMS } from '../config/permissions.js';

function loadLS() {
  const v = getJSON('appPerms', null);
  return v && typeof v === 'object' ? v : structuredClone(DEFAULT_PERMS);
}

// Cache modul agar semua guard/menu berbagi 1x fetch
let permsCache = null;
export function fetchPerms() {
  if (!permsCache) {
    permsCache = getPerms().catch((e) => {
      permsCache = null;
      throw e;
    });
  }
  return permsCache;
}

export function usePermissions() {
  const { user } = useAuth();
  const [perms, setPerms] = useState(loadLS);

  useEffect(() => {
    let ignore = false;
    fetchPerms()
      .then((r) => {
        if (!ignore && r && r.perms && Object.keys(r.perms).length) {
          setPerms(r.perms);
          storageSet('appPerms', r.perms);
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const role = user?.role || 'Viewer';
  const can = (mod) => role === 'Super Admin' || !!perms?.[role]?.[mod];
  return { perms, role, can };
}
