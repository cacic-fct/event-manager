import { commandFileLinks } from './command-files';

describe('command file inspection links', () => {
  const proposal = '00000000-0000-4000-8000-000000000001';
  const file = '00000000-0000-4000-8000-000000000002';
  it('links nested immutable uploads and transfer files to the own proposal', () => {
    expect(commandFileLinks(proposal, { input: { artifactId: file, sha256: 'a'.repeat(64) } })).toEqual([
      { id: file, href: `/api/admin/mcp/operations/proposals/${proposal}/files/${file}` },
    ]);
    expect(commandFileLinks(proposal, { documentArtifactId: file, documentSha256: 'b'.repeat(64) })).toHaveLength(1);
  });
  it('does not turn arbitrary URLs or incomplete references into links', () => {
    expect(commandFileLinks(proposal, { artifactId: 'https://example.test', sha256: 'a'.repeat(64) })).toEqual([]);
    expect(commandFileLinks(proposal, { artifactId: file })).toEqual([]);
    expect(commandFileLinks('../other', { artifactId: file, sha256: 'a'.repeat(64) })).toEqual([]);
  });
});
