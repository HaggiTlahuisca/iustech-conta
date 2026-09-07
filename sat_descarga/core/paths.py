"""
Composición centralizada de las rutas de salida LOCAL de las descargas.

Única fuente de verdad del layout `descargas/`, agrupado por **tipo de documento → RFC**
(no por método de autenticación: al usuario no le importa si bajó por CIEC o e.firma).

Modificado para Aislamiento de Entorno: Fuerza a que las carpetas se creen
de forma relativa al ejecutable o script principal, evitando ensuciar la ruta global del usuario.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path
from typing import Optional, Union

# --- Lógica de Aislamiento de Entorno (Modo Portable) ---
def get_app_dir() -> Path:
    """
    Determina el directorio base de la aplicación.
    Si es un ejecutable congelado (PyInstaller, cx_Freeze), usa el directorio del ejecutable.
    Si es un script normal, usa el directorio de ejecución actual (cwd).
    """
    if getattr(sys, 'frozen', False):
        # Si está empaquetado como un .exe
        return Path(sys.executable).parent
    else:
        # Si se ejecuta desde el código fuente (.venv)
        return Path.cwd()

# --- Punto único para nombrar las carpetas (singular ↔ plural) -------------
# Ahora BASE_DIR es una ruta absoluta anclada a la carpeta de la app.
BASE_DIR = get_app_dir() / "descargas"
TIPO_CFDI = "cfdi"              # categoría en singular; → "cfdis" para plural
TIPO_CONSTANCIA = "constancia"  # → "constancias"
TIPO_OPINION = "opinion"        # → "opiniones"
TIPO_RENOVACION = "renovacion"  # e.firma: .ren/.key/acuse/cer del trámite de renovación
TIPO_CSD = "csd"                # CSD: .sdg/.key/acuse/cer por solicitud de sello
TIPO_CE = "ce"                  # contabilidad electrónica: acuses AR_/AP_ por envío

SUB_EMITIDOS = "emitidos"       # colecciones en plural
SUB_RECIBIDOS = "recibidos"
_SUB_POR_TIPO = {"E": SUB_EMITIDOS, "R": SUB_RECIBIDOS}

# True  = una carpeta por solicitud, nombrada por rango ({desde}_a_{hasta}/).
# False = plano: todos los XML juntos bajo emitidos/recibidos (reorganizar luego
#         con `sat-dm organizar`).
AGRUPAR_POR_EVENTO = True


def base() -> Path:
    """Raíz absoluta `descargas/`."""
    return Path(BASE_DIR)


def _raiz(salida_base: Optional[Union[str, Path]]) -> Path:
    """Base efectiva: el `--salida` del usuario si lo dio, si no `descargas/` absolutas."""
    return Path(salida_base) if salida_base else base()


def etiqueta_rango(desde: date, hasta: date) -> str:
    """Nombre de la carpeta de solicitud: ``2026-01-01_a_2026-03-31``."""
    return f"{desde.isoformat()}_a_{hasta.isoformat()}"


def dir_cfdi(
    rfc: str,
    tipo: str,
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    *,
    salida_base: Optional[Union[str, Path]] = None,
) -> Path:
    """
    ``[DIRECTORIO_APP]/descargas/cfdi/{RFC}/{emitidos|recibidos}/[{desde}_a_{hasta}]/``

    El nivel de carpeta por solicitud se omite si `AGRUPAR_POR_EVENTO` es False o si
    no se pasan ambas fechas.

    Args:
        tipo: "E" (emitidos) o "R" (recibidos).
    """
    d = _raiz(salida_base) / TIPO_CFDI / rfc.strip().upper() / _SUB_POR_TIPO[tipo.strip().upper()]
    if AGRUPAR_POR_EVENTO and desde is not None and hasta is not None:
        d = d / etiqueta_rango(desde, hasta)
    return d


def dir_cfdi_base(rfc: str, *, salida_base: Optional[Union[str, Path]] = None) -> Path:
    """``[DIRECTORIO_APP]/descargas/cfdi/{RFC}/`` — usado por `retomar` (sin tipo ni fechas conocidos)."""
    return _raiz(salida_base) / TIPO_CFDI / rfc.strip().upper()


def dir_documento(
    tipo_doc: str,
    rfc: str,
    *,
    salida_base: Optional[Union[str, Path]] = None,
) -> Path:
    """
    ``[DIRECTORIO_APP]/descargas/{tipo_doc}/{RFC}/`` para documentos PDF (constancia, opinión).

    Args:
        tipo_doc: una de las constantes `TIPO_CONSTANCIA` / `TIPO_OPINION`.
        rfc: si viene vacío (p. ej. FIEL sin resolver aún), usa ``sin_rfc``.
    """
    rfc_seg = rfc.strip().upper() if rfc and rfc.strip() else "sin_rfc"
    return _raiz(salida_base) / tipo_doc / rfc_seg


def dir_ce(
    rfc: str,
    ejercicio: Union[int, str],
    *,
    salida_base: Optional[Union[str, Path]] = None,
) -> Path:
    """``[DIRECTORIO_APP]/descargas/ce/{RFC}/{ejercicio}/`` — acuses de contabilidad electrónica.

    El nivel {ejercicio} espeja ``diot/presentaciones/{RFC}/{ejercicio}/`` y evita
    mezclar años (hasta 13 periodos x 2 acuses AR_/AP_ por año).
    """
    return dir_documento(TIPO_CE, rfc, salida_base=salida_base) / str(ejercicio)
