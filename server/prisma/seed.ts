import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as Y from 'yjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'demo1234';

// Duplicated from src/utils/hash.ts and src/utils/yjs.ts rather than imported: the production
// Docker image only ships server/dist (compiled output), not server/src (see server/Dockerfile
// — multi-stage builds intentionally exclude source from the final image), and this seed script
// runs via `prisma db seed` against that image. The logic is a couple of lines each; keeping it
// self-contained here is simpler than reaching into a stage that may not exist.
async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, 12);
}

function createEmptyYDocState(): Buffer {
  const ydoc = new Y.Doc();
  const state = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return Buffer.from(state);
}

async function main() {
  console.log('Seeding database...');

  const password = await hashPassword(DEMO_PASSWORD);

  const alice = await prisma.user.upsert({
    where: { email: 'alice@demo.com' },
    update: {},
    create: { name: 'Alice Johnson', email: 'alice@demo.com', password },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@demo.com' },
    update: {},
    create: { name: 'Bob Smith', email: 'bob@demo.com', password },
  });

  const carol = await prisma.user.upsert({
    where: { email: 'carol@demo.com' },
    update: {},
    create: { name: 'Carol Williams', email: 'carol@demo.com', password },
  });

  console.log(`Created users: ${alice.name}, ${bob.name}, ${carol.name}`);

  const workFolder = await prisma.folder.upsert({
    where: { id: 'seed-folder-work' },
    update: {},
    create: { id: 'seed-folder-work', name: 'Work', userId: alice.id },
  });

  const personalFolder = await prisma.folder.upsert({
    where: { id: 'seed-folder-personal' },
    update: {},
    create: { id: 'seed-folder-personal', name: 'Personal', userId: alice.id },
  });

  console.log(`Created folders: ${workFolder.name}, ${personalFolder.name}`);

  const docs: { id: string; title: string; ownerId: string; folderId?: string }[] = [
    { id: 'seed-doc-roadmap', title: 'Project Roadmap Q3 2026', ownerId: alice.id, folderId: workFolder.id },
    { id: 'seed-doc-design-review', title: 'Meeting Notes - Design Review', ownerId: alice.id, folderId: workFolder.id },
    { id: 'seed-doc-api-docs', title: 'API Documentation', ownerId: alice.id, folderId: workFolder.id },
    { id: 'seed-doc-journal', title: 'Weekly Journal', ownerId: alice.id, folderId: personalFolder.id },
    { id: 'seed-doc-adr', title: 'Architecture Decision Record', ownerId: bob.id },
    { id: 'seed-doc-onboarding', title: 'Onboarding Guide', ownerId: bob.id },
    { id: 'seed-doc-crdt-research', title: 'Research Notes - CRDTs', ownerId: carol.id },
  ];

  const emptyContent = createEmptyYDocState();

  for (const doc of docs) {
    await prisma.document.upsert({
      where: { id: doc.id },
      update: {},
      create: {
        id: doc.id,
        title: doc.title,
        ownerId: doc.ownerId,
        folderId: doc.folderId ?? null,
        content: emptyContent,
        // The owner is also their own OWNER collaborator row — mirrors what createDocument()
        // does for documents created through the app, so seeded docs behave identically
        // (e.g. Dashboard's `myCollaboratorId` "leave" affordance).
        collaborators: { create: { userId: doc.ownerId, role: 'OWNER' } },
      },
    });
  }

  console.log(`Created ${docs.length} documents`);

  // Bob and Carol collaborate on Alice's roadmap.
  const roadmapId = 'seed-doc-roadmap';
  await prisma.collaborator.upsert({
    where: { documentId_userId: { documentId: roadmapId, userId: bob.id } },
    update: {},
    create: { documentId: roadmapId, userId: bob.id, role: 'EDITOR' },
  });
  await prisma.collaborator.upsert({
    where: { documentId_userId: { documentId: roadmapId, userId: carol.id } },
    update: {},
    create: { documentId: roadmapId, userId: carol.id, role: 'VIEWER' },
  });

  console.log('Added collaborators');

  await prisma.starredDocument.upsert({
    where: { userId_documentId: { userId: alice.id, documentId: roadmapId } },
    update: {},
    create: { userId: alice.id, documentId: roadmapId },
  });

  console.log('Added starred documents');

  console.log('');
  console.log('=== Seed Complete ===');
  console.log('');
  console.log(`Demo accounts (password for all: ${DEMO_PASSWORD}):`);
  console.log('  alice@demo.com  — has documents, folders, collaborators');
  console.log("  bob@demo.com    — has documents, is collaborator on Alice's roadmap");
  console.log("  carol@demo.com  — has documents, is viewer on Alice's roadmap");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Seed error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
