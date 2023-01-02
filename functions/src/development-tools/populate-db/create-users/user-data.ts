import { UserImportRecord } from 'firebase-admin/auth';

export const adminData: UserImportRecord = {
  phoneNumber: '+5518911111111',
  displayName: 'Admin',
  disabled: false,
  uid: 'uid_admin',
  email: 'admin@unesp.br',
  emailVerified: true,
  photoURL: 'https://via.placeholder.com/256/?text=Admin',
  metadata: {
    lastSignInTime: 'Thu, 01 Jan 1970 00:00:00 UTC',
    creationTime: 'Thu, 01 Jan 1970 00:00:00 UTC',
  },
  providerData: [
    {
      photoURL: 'https://via.placeholder.com/256/?text=Admin',
      providerId: 'google.com',
      uid: 'uid_admin',
      displayName: 'Admin',
      email: 'admin@unesp.br',
      phoneNumber: undefined,
    },
  ],
};

export const adminDataFirestoreDocument = {
  displayName: adminData.displayName,
  fullName: adminData.displayName,
  email: adminData.email,
  phone: adminData.phoneNumber,
  photoURL: adminData.photoURL,
  linkedPersonalEmail: false,
  associateStatus: 'undergraduate',
  academicID: '201200000',
  dataVersion: '0.3.0',
  uid: adminData.uid,
};

export const undergraduateData: UserImportRecord = {
  phoneNumber: '+5518922222222',
  displayName: 'Aluno da graduação',
  disabled: false,
  uid: 'uid_undergraduate',
  email: 'aluno.graduacao@unesp.br',
  emailVerified: true,
  photoURL: 'https://via.placeholder.com/256/?text=Aluno%20da%20gradu%C3%A7%C3%A3cao',
  metadata: {
    lastSignInTime: 'Thu, 01 Jan 1970 00:00:00 UTC',
    creationTime: 'Thu, 01 Jan 1970 00:00:00 UTC',
  },
  providerData: [
    {
      photoURL: 'https://via.placeholder.com/256/?text=Aluno%20da%20gradu%C3%A7%C3%A3cao',
      providerId: 'google.com',
      uid: 'uid_undergraduate',
      displayName: 'Aluno da graduação',
      email: 'aluno.graduacao@unesp.br',
      phoneNumber: undefined,
    },
  ],
};

export const undergraduateDataFirestoreDocument = {
  displayName: undergraduateData.displayName,
  fullName: undergraduateData.displayName,
  linkedPersonalEmail: false,
  email: undergraduateData.email,
  phone: undergraduateData.phoneNumber,
  photoURL: undergraduateData.photoURL,
  associateStatus: 'undergraduate',
  academicID: '201200000',
  dataVersion: '0.3.0',
  uid: undergraduateData.uid,
};

export const professorData: UserImportRecord = {
  phoneNumber: '+5518933333333',
  displayName: 'Professor',
  disabled: false,
  uid: 'uid_professor',
  email: 'professor@unesp.br',
  emailVerified: true,
  photoURL: 'https://via.placeholder.com/256/?text=Professor',
  metadata: {
    lastSignInTime: 'Thu, 01 Jan 1970 00:00:00 UTC',
    creationTime: 'Thu, 01 Jan 1970 00:00:00 UTC',
  },
  providerData: [
    {
      photoURL: 'https://via.placeholder.com/256/?text=Professor',
      providerId: 'google.com',
      uid: 'uid_professor',
      displayName: 'Professor',
      email: 'professor@unesp.br',
      phoneNumber: undefined,
    },
  ],
};

export const professorDataFirestoreDocument = {
  displayName: professorData.displayName,
  fullName: professorData.displayName,
  linkedPersonalEmail: false,
  email: professorData.email,
  phone: professorData.phoneNumber,
  photoURL: professorData.photoURL,
  associateStatus: 'professor',
  dataVersion: '0.3.0',
  uid: professorData.uid,
};

export const externalData: UserImportRecord = {
  phoneNumber: '+5518944444444',
  displayName: 'Usuário externo',
  disabled: false,
  uid: 'uid_external',
  email: 'externo@gmail.com',
  emailVerified: true,
  photoURL: 'https://via.placeholder.com/256/?text=Usu%C3%A1rio%20externo',
  metadata: {
    lastSignInTime: 'Thu, 01 Jan 1970 00:00:00 UTC',
    creationTime: 'Thu, 01 Jan 1970 00:00:00 UTC',
  },
  providerData: [
    {
      photoURL: 'https://via.placeholder.com/256/?text=Usu%C3%A1rio%20externo',
      providerId: 'google.com',
      uid: 'uid_external',
      displayName: 'Usuário externo',
      email: 'externo@gmail.com',
      phoneNumber: undefined,
    },
  ],
};

export const externalDataFirestoreDocument = {
  displayName: externalData.displayName,
  fullName: externalData.displayName,
  linkedPersonalEmail: false,
  email: externalData.email,
  phone: externalData.phoneNumber,
  photoURL: externalData.photoURL,
  associateStatus: 'external',
  dataVersion: '0.3.0',
  uid: externalData.uid,
};
