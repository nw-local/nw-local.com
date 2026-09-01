export function firstBlankGlossaryAliasIndex( aliases: unknown ): number | undefined {
  if( !Array.isArray( aliases ) ) return undefined;

  for( const [ aliasIndex, alias ] of aliases.entries() ) {
    if( typeof alias !== "string" || !alias.trim() ) return aliasIndex;
  }

  return undefined;
}
