export const MAIL_SUJET_DEFAUT = "Votre devis {{société}}";

export const MAIL_CORPS_DEFAUT = `Bonjour {{client}},

Veuillez trouver ci-joint le devis n° {{numero}}{{objet}}.

Date d'émission : {{date}}
Validité : {{validité}} jours

Restant à votre disposition.

Cordialement,
{{société}}
{{téléphone}}`;

export const CONDITIONS_ACCEPTATION_DEFAUT = `Bon pour accord.

Un acompte de 30 % est exigé à la commande. Le solde est dû à la livraison et/ou à la fin de la pose.

Règlement par virement :
IBAN : {{iban}}

En signant le présent devis, le client reconnaît avoir pris connaissance du Cahier de Clauses Générales ci-après et l'accepte sans réserve.`;

export const MAIL_VARIABLES_AIDE =
  "Variables : {{client}}, {{numero}}, {{société}}, {{téléphone}}, {{objet}}, {{date}}, {{validité}}, {{iban}}.";
