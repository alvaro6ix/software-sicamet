import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';

// Contexto compartido con la lista de permisos atómicos del usuario actual.
// Se hidrata via /api/permisos/yo al login y se reusa en toda la app.
const PermisosContext = createContext({
    permisos: new Set(),
    esAdmin: false,
    listo: false,
    recargar: () => {},
    tiene: () => false
});

export function PermisosProvider({ children, usuario }) {
    const [permisos, setPermisos] = useState(new Set());
    const [esAdmin, setEsAdmin] = useState(false);
    const [listo, setListo] = useState(false);

    const recargar = useCallback(async () => {
        if (!usuario) {
            setPermisos(new Set());
            setEsAdmin(false);
            setListo(true);
            return;
        }
        try {
            const { data } = await axios.get('/api/permisos/yo');
            setPermisos(new Set(data.permisos || []));
            setEsAdmin(!!data.esAdmin);
        } catch (err) {
            // En caso de error dejamos sin permisos: el backend bloqueará igual.
            setPermisos(new Set());
            setEsAdmin(false);
        } finally {
            setListo(true);
        }
    }, [usuario]);

    useEffect(() => { recargar(); }, [recargar]);

    const tiene = useCallback((permiso) => {
        if (esAdmin) return true;
        if (Array.isArray(permiso)) return permiso.some(p => permisos.has(p));
        return permisos.has(permiso);
    }, [permisos, esAdmin]);

    return (
        <PermisosContext.Provider value={{ permisos, esAdmin, listo, recargar, tiene }}>
            {children}
        </PermisosContext.Provider>
    );
}

export function usePermisos() {
    return useContext(PermisosContext);
}
