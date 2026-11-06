import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'zenstack360-connect', eventKey: process.env.INNGEST_EVENT_KEY });
