/**
 * PeopleService.gs — Google Contacts integration via People API Advanced Service.
 */

/**
 * Search for an existing contact in Google Contacts.
 * @param {string} name Contact name.
 * @param {string} email Contact email.
 * @param {string} phone Contact phone.
 * @param {string} resourceName Known resource name from previous sync.
 * @return {Object|null} Match result or null.
 */
function searchExistingContact(name, email, phone, resourceName) {
  // Priority 1: By resourceName (previously synced)
  if (resourceName) {
    try {
      var person = People.People.get(resourceName, {
        personFields: 'names,emailAddresses,phoneNumbers,organizations,metadata'
      });
      if (person) {
        return {
          found: true,
          resourceName: person.resourceName,
          etag: person.etag,
          person: person
        };
      }
    } catch (e) {
      // Resource not found, continue searching
    }
  }

  // Priority 2: By email
  if (email) {
    try {
      var emailResult = People.People.searchContacts({
        query: email,
        readMask: 'names,emailAddresses,phoneNumbers,organizations,metadata'
      });
      if (emailResult && emailResult.results) {
        for (var i = 0; i < emailResult.results.length; i++) {
          var p = emailResult.results[i].person;
          if (p && p.emailAddresses) {
            for (var j = 0; j < p.emailAddresses.length; j++) {
              if (p.emailAddresses[j].value &&
                  p.emailAddresses[j].value.toLowerCase() === email.toLowerCase()) {
                return {
                  found: true,
                  resourceName: p.resourceName,
                  etag: p.etag,
                  person: p
                };
              }
            }
          }
        }
      }
    } catch (e) {
      // Search failed, continue
    }
  }

  // Priority 3: By phone
  if (phone) {
    try {
      var phoneResult = People.People.searchContacts({
        query: phone,
        readMask: 'names,emailAddresses,phoneNumbers,organizations,metadata'
      });
      if (phoneResult && phoneResult.results) {
        for (var i = 0; i < phoneResult.results.length; i++) {
          var p2 = phoneResult.results[i].person;
          if (p2 && p2.phoneNumbers) {
            for (var j = 0; j < p2.phoneNumbers.length; j++) {
              var pNum = String(p2.phoneNumbers[j].value || '').replace(/\D/g, '');
              if (pNum === phone) {
                return {
                  found: true,
                  resourceName: p2.resourceName,
                  etag: p2.etag,
                  person: p2
                };
              }
            }
          }
        }
      }
    } catch (e) {
      // Search failed, continue
    }
  }

  // Priority 4: By name + organization
  if (name) {
    try {
      var nameResult = People.People.searchContacts({
        query: name,
        readMask: 'names,emailAddresses,phoneNumbers,organizations,metadata'
      });
      if (nameResult && nameResult.results) {
        var config = loadConfig();
        var org = config.DEFAULT_ORGANIZATION || '';
        for (var i = 0; i < nameResult.results.length; i++) {
          var p3 = nameResult.results[i].person;
          if (p3 && p3.names) {
            for (var n = 0; n < p3.names.length; n++) {
              var displayName = p3.names[n].displayName || '';
              if (displayName.toLowerCase().indexOf(name.toLowerCase()) !== -1) {
                if (org && p3.organizations) {
                  for (var o = 0; o < p3.organizations.length; o++) {
                    if (p3.organizations[o].name &&
                        p3.organizations[o].name.toLowerCase() === org.toLowerCase()) {
                      return {
                        found: true,
                        resourceName: p3.resourceName,
                        etag: p3.etag,
                        person: p3
                      };
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {
      // Search failed
    }
  }

  return null;
}

/**
 * Build a People API person resource from contact data.
 * @param {Object} contactData Contact row object.
 * @return {Object} People API person resource.
 */
function buildPersonResource(contactData) {
  var config = loadConfig();
  var resource = {};

  // Names
  var nameParts = splitFullName(contactData.fullName || '');
  var nameObj = {
    givenName: contactData.givenName || nameParts.givenName,
    familyName: contactData.familyName || nameParts.familyName
  };
  if (contactData.middleName) nameObj.middleName = contactData.middleName;
  resource.names = [nameObj];

  // Email addresses
  var emails = [];
  if (contactData.emailPrimary) {
    emails.push({ value: contactData.emailPrimary, type: 'other' });
  }
  if (contactData.emailSecondary) {
    emails.push({ value: contactData.emailSecondary, type: 'other' });
  }
  if (emails.length > 0) resource.emailAddresses = emails;

  // Phone numbers
  var phones = [];
  if (contactData.phonePrimary) {
    phones.push({ value: '+' + contactData.phonePrimary, type: 'mobile' });
  }
  if (contactData.phoneSecondary) {
    phones.push({ value: '+' + contactData.phoneSecondary, type: 'mobile' });
  }
  if (phones.length > 0) resource.phoneNumbers = phones;

  // Organization
  var orgName = contactData.organization || config.DEFAULT_ORGANIZATION || '';
  if (orgName) {
    resource.organizations = [{
      name: orgName,
      title: contactData.jobTitle || '',
      department: contactData.classLabel || ''
    }];
  }

  // Address
  if (contactData.address) {
    resource.addresses = [{ formattedValue: contactData.address, type: 'home' }];
  }

  // User-defined fields (for consolidated parent mode)
  var userDefined = [];
  if (contactData.classLabel) {
    userDefined.push({ key: 'classLabel', value: contactData.classLabel });
  }
  if (contactData.yearLabel) {
    userDefined.push({ key: 'yearLabel', value: contactData.yearLabel });
  }
  if (contactData.nisn) {
    userDefined.push({ key: 'NISN', value: contactData.nisn });
  }

  if (config.PARENT_CONTACT_MODE === 'consolidated') {
    if (contactData.parentName) {
      userDefined.push({ key: 'parentName', value: contactData.parentName });
    }
    if (contactData.parentPhone) {
      userDefined.push({ key: 'parentPhone', value: contactData.parentPhone });
    }
    if (contactData.parentEmail) {
      userDefined.push({ key: 'parentEmail', value: contactData.parentEmail });
    }
    if (contactData.parentRole) {
      userDefined.push({ key: 'parentRole', value: contactData.parentRole });
    }
  }
  if (userDefined.length > 0) resource.userDefined = userDefined;

  // Relations (parent)
  if (config.PARENT_CONTACT_MODE === 'consolidated' && contactData.parentName) {
    var relType = 'relative';
    if (contactData.parentRole === 'Ayah') relType = 'father';
    else if (contactData.parentRole === 'Ibu') relType = 'mother';
    resource.relations = [{ person: contactData.parentName, type: relType }];
  }

  // Biographies / notes
  if (contactData.notes) {
    resource.biographies = [{ value: contactData.notes, contentType: 'TEXT_PLAIN' }];
  }

  // Nicknames
  if (contactData.nickname) {
    resource.nicknames = [{ value: contactData.nickname }];
  }

  // Birthday
  if (contactData.birthday) {
    var bday = parseBirthday(contactData.birthday);
    if (bday) {
      resource.birthdays = [{ date: bday }];
    }
  }

  // Group membership — support multiple labels
  var memberships = [];
  var groupName = contactData.groupName || config.DEFAULT_GROUP_NAME || '';
  if (groupName) {
    try {
      var group = getOrCreateContactGroup(groupName);
      if (group && group.resourceName) {
        memberships.push({
          contactGroupMembership: { contactGroupResourceName: group.resourceName }
        });
      }
    } catch (e) {}
  }

  var labelsStr = String(contactData.labels || '').trim();
  if (labelsStr) {
    var labelParts = labelsStr.split(':::');
    for (var lp = 0; lp < labelParts.length; lp++) {
      var labelName = labelParts[lp].trim();
      if (labelName) {
        try {
          var labelGroup = getOrCreateContactGroup(labelName);
          if (labelGroup && labelGroup.resourceName) {
            var alreadyAdded = false;
            for (var m = 0; m < memberships.length; m++) {
              if (memberships[m].contactGroupMembership &&
                  memberships[m].contactGroupMembership.contactGroupResourceName === labelGroup.resourceName) {
                alreadyAdded = true;
                break;
              }
            }
            if (!alreadyAdded) {
              memberships.push({
                contactGroupMembership: { contactGroupResourceName: labelGroup.resourceName }
              });
            }
          }
        } catch (e) {}
      }
    }
  }

  if (memberships.length > 0) {
    resource.memberships = memberships;
  }

  return resource;
}

/**
 * Parse a birthday string into a People API date object.
 * @param {string} birthday Birthday in YYYY-MM-DD or --MM-DD format.
 * @return {Object|null} { year, month, day } or null.
 */
function parseBirthday(birthday) {
  var s = String(birthday || '').trim();
  if (!s) return null;

  if (s.indexOf('--') === 0) {
    var parts = s.substring(2).split('-');
    if (parts.length === 2) {
      return {
        month: parseInt(parts[0], 10),
        day: parseInt(parts[1], 10)
      };
    }
  }

  var fullParts = s.split('-');
  if (fullParts.length === 3) {
    return {
      year: parseInt(fullParts[0], 10),
      month: parseInt(fullParts[1], 10),
      day: parseInt(fullParts[2], 10)
    };
  }

  return null;
}

/**
 * Create a new Google Contact.
 * @param {Object} contactData Contact row object.
 * @return {Object} { success, resourceName, etag }
 */
function createGoogleContact(contactData) {
  try {
    var resource = buildPersonResource(contactData);
    var person = People.People.createContact(resource);
    return {
      success: true,
      resourceName: person.resourceName,
      etag: person.etag
    };
  } catch (e) {
    return {
      success: false,
      resourceName: '',
      etag: '',
      error: e.toString()
    };
  }
}

/**
 * Update an existing Google Contact.
 * @param {string} resourceName Contact resource name.
 * @param {string} etag Contact etag for conflict detection.
 * @param {Object} contactData Updated contact data.
 * @return {Object} { success, resourceName, etag, retried }
 */
function updateGoogleContact(resourceName, etag, contactData) {
  try {
    var resource = buildPersonResource(contactData);
    resource.etag = etag;

    var updateFields = 'names,emailAddresses,phoneNumbers,organizations,addresses,userDefined,relations,biographies,nicknames,birthdays,memberships';
    var person = People.People.updateContact(resource, resourceName, {
      updatePersonFields: updateFields
    });

    return {
      success: true,
      resourceName: person.resourceName,
      etag: person.etag,
      retried: false
    };
  } catch (e) {
    // Stale etag — re-fetch and retry once
    if (e.toString().indexOf('etag') !== -1 || e.toString().indexOf('conflict') !== -1) {
      try {
        var fresh = People.People.get(resourceName, {
          personFields: 'names,emailAddresses,phoneNumbers,organizations,metadata'
        });

        var resource2 = buildPersonResource(contactData);
        resource2.etag = fresh.etag;

        var updateFields2 = 'names,emailAddresses,phoneNumbers,organizations,addresses,userDefined,relations,biographies,nicknames,birthdays,memberships';
        var person2 = People.People.updateContact(resource2, resourceName, {
          updatePersonFields: updateFields2
        });

        return {
          success: true,
          resourceName: person2.resourceName,
          etag: person2.etag,
          retried: true
        };
      } catch (e2) {
        return {
          success: false,
          resourceName: resourceName,
          etag: '',
          retried: true,
          error: e2.toString()
        };
      }
    }

    return {
      success: false,
      resourceName: resourceName,
      etag: '',
      retried: false,
      error: e.toString()
    };
  }
}

/**
 * Get or create a contact group by name.
 * @param {string} groupName Group name.
 * @return {Object} { resourceName }
 */
function getOrCreateContactGroup(groupName) {
  try {
    var groups = People.ContactGroups.list({ pageSize: 100 });
    if (groups && groups.contactGroups) {
      for (var i = 0; i < groups.contactGroups.length; i++) {
        if (groups.contactGroups[i].name === groupName) {
          return { resourceName: groups.contactGroups[i].resourceName };
        }
      }
    }

    var newGroup = People.ContactGroups.create({ contactGroup: { name: groupName } });
    return { resourceName: newGroup.resourceName };
  } catch (e) {
    return { resourceName: '', error: e.toString() };
  }
}

/**
 * Fetch all Google Contacts (paginated).
 * @return {Array<Object>} Array of simplified contact objects.
 */
function fetchAllGoogleContacts() {
  var contacts = [];
  var pageToken = '';
  var pageSize = 100;

  try {
    do {
      var options = {
        resourceName: 'people/me',
        personFields: 'names,emailAddresses,phoneNumbers,organizations,metadata,userDefined,relations',
        pageSize: pageSize
      };
      if (pageToken) {
        options.pageToken = pageToken;
      }

      var response = People.People.Connections.list('people/me', options);

      if (response && response.connections) {
        for (var i = 0; i < response.connections.length; i++) {
          var p = response.connections[i];
          var simplified = {
            resourceName: p.resourceName || '',
            etag: p.etag || '',
            displayName: '',
            givenName: '',
            familyName: '',
            email: '',
            phone: '',
            organization: ''
          };

          if (p.names && p.names.length > 0) {
            simplified.displayName = p.names[0].displayName || '';
            simplified.givenName = p.names[0].givenName || '';
            simplified.familyName = p.names[0].familyName || '';
          }
          if (p.emailAddresses && p.emailAddresses.length > 0) {
            simplified.email = p.emailAddresses[0].value || '';
          }
          if (p.phoneNumbers && p.phoneNumbers.length > 0) {
            simplified.phone = p.phoneNumbers[0].value || '';
          }
          if (p.organizations && p.organizations.length > 0) {
            simplified.organization = p.organizations[0].name || '';
          }

          contacts.push(simplified);
        }
      }

      pageToken = (response && response.nextPageToken) ? response.nextPageToken : '';
    } while (pageToken);
  } catch (e) {
    logAction('system', 'fetchContacts', 'error', 'Failed to fetch Google Contacts', e.toString());
  }

  return contacts;
}
