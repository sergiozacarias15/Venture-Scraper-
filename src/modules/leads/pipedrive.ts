/**
 * Pipedrive preparation. Nothing here calls Pipedrive yet: leads carry the columns
 * (pipedrive_person_id, pipedrive_deal_id, pipedrive_sync_status) and this mapper defines the
 * payload shape, so a sync job can be added without a schema change.
 */
export type LeadForSync = {
  full_name: string;
  profile_url: string;
  birth_year: number | null;
  nationality: string | null;
  position: string | null;
  club: string | null;
  instagram: string | null;
  lead_status: string;
  off_platform_channel: string | null;
  guardian_consent_at: Date | null;
  notes: string | null;
};

export function toPipedrivePayload(l: LeadForSync) {
  return {
    person: { name: l.full_name },
    deal: { title: `${l.full_name} - Venture Sports USA` },
    note: [
      `Volleybox: ${l.profile_url}`,
      l.birth_year ? `Birth year: ${l.birth_year}` : null,
      l.nationality ? `Nationality: ${l.nationality}` : null,
      l.position ? `Position: ${l.position}` : null,
      l.club ? `Club: ${l.club}` : null,
      l.instagram ? `Instagram: @${l.instagram}` : null,
      l.off_platform_channel ? `Moved to: ${l.off_platform_channel}` : null,
      l.guardian_consent_at ? "Guardian involved: yes" : null,
      l.notes ? `Notes: ${l.notes}` : null,
    ].filter(Boolean).join("\n"),
  };
}
