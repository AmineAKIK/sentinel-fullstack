#!/usr/bin/env bash
# Lecture SÛRE d'un fichier .env, sans jamais l'exécuter comme du shell.
#
# `source .env` interprète le contenu : une valeur contenant un espace
# (BOARD_ACCESS_LABEL=Board atelier) lance une commande, et un bcrypt
# ($2b$10$...) voit ses $2, $10 remplacés par des variables shell vides — le
# hash est corrompu. On extrait donc chaque variable par parsing, sans eval.
#
# read_env_var <fichier_env> <NOM_VARIABLE>
#   Écrit la valeur sur stdout (chaîne vide si absente). La valeur est prise
#   littéralement : espaces conservés, $ jamais interpolé, # après un espace
#   traité comme un commentaire uniquement hors guillemets, guillemets
#   externes retirés.

read_env_var() {
  local file="$1" name="$2"
  [[ -f "$file" ]] || return 0

  local line value
  # Dernière affectation gagnante (comme dotenv). Motif strict : NOM=...
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${name}=" "$file" | tail -n 1)" || true
  [[ -n "$line" ]] || return 0

  # Retirer un éventuel `export ` et le préfixe `NOM=`.
  value="${line#*"${name}="}"

  # Guillemets : si la valeur est entièrement quotée, on retire les guillemets
  # et on prend le contenu littéral (aucune interpolation, aucun commentaire).
  if [[ "$value" =~ ^\"(.*)\"[[:space:]]*$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$value" =~ ^\'(.*)\'[[:space:]]*$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi

  # Valeur nue : un `#` précédé d'un espace démarre un commentaire ; on le
  # retire, puis on ôte les espaces de fin. Les `$` restent littéraux.
  value="${value%%[[:space:]]#*}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}
