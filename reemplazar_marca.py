"""Script de reemplazo seguro de identidad de marca para IusTechConta."""

from pathlib import Path

ARCHIVOS_A_MODIFICAR = [
    Path("sat_descarga/cli/config_store.py"),
    Path("sat_descarga/api/__main__.py"),
    Path("sat_descarga/portal/setup.py"),
    Path("sat_descarga/api/license_client.py"),
    Path("sat_descarga/calculadoras/exportar.py"),
    Path("sat_descarga/api/routers/certifica.py"),
    Path("sat_descarga/api/state.py"),
    Path("ui/src/app/login/page.tsx"),
    Path("ui/src/components/layout/brand-mark.tsx"),
]

PAREJAS_REEMPLAZO = [
    (".sat-descarga", ".iustechconta"),
    ("Documents/TodoConta", "Documents/IusTechConta"),
    ("Documents\\TodoConta", "Documents\\IusTechConta"),
    ("com.todoconta.desktop", "com.iustechconta.desktop"),
    ("api.todoconta.com", "api.iustechconta.com"),
    ("app.todoconta.com", "app.iustechconta.com"),
    ("todoconta.com", "iustechconta.com"),
    ("todoconta://", "iustechconta://"),
    ("TodoConta", "IusTechConta"),
    ("todoconta", "iustechconta"),
    # Restablecer la condición web para llamar a Supabase en la nube
    (
        "const webNecesitaProvision = false;",
        "const webNecesitaProvision = esWeb() && webSinConexion;",
    ),
]


def aplicar_cambios():
    total_modificados = 0

    for ruta in ARCHIVOS_A_MODIFICAR:
        if not ruta.exists():
            print(f"[OMITIDO] No existe el archivo: {ruta}")
            continue

        contenido_original = ruta.read_text(encoding="utf-8")
        contenido_nuevo = contenido_original

        for buscar, reemplazar in PAREJAS_REEMPLAZO:
            contenido_nuevo = contenido_nuevo.replace(buscar, reemplazar)

        if contenido_nuevo != contenido_original:
            ruta.write_text(contenido_nuevo, encoding="utf-8")
            print(f"[OK] Actualizado exitosamente: {ruta}")
            total_modificados += 1
        else:
            print(f"[SIN CAMBIOS] No requirió modificaciones: {ruta}")

    print(f"\nProceso terminado. Se actualizaron {total_modificados} archivos.")


if __name__ == "__main__":
    aplicar_cambios()