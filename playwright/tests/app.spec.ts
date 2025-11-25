// TODO - observed time is wrong, need to read it from image metadata.
// this is bc i fucked up MVing the files - need to just re-copy them with metadata preserved

// see if i can temporarily relinquish test after i get to the captcha.
// see if i can programmatically solve the captcha..? see what kind of error i get..?
// make address and contact info a json file
// put this in github

import { test, expect, Page } from "@playwright/test";
import path from "path";
import fs from "fs";

test.setTimeout(180_000); // 3 minutes per test

/*
npx playwright test tests/app.spec.ts --headed
*/

// We now start at the article URL
const ARTICLE_URL = "https://portal.311.nyc.gov/article/?kanumber=KA-01957";

const PHOTO_PATH = getFirstJpegFromMedia();

function getFirstJpegFromMedia(): string {
  // __dirname points to playwright/tests (where app.spec.ts lives)
  const mediaDir = path.resolve(__dirname, "../media/2025-11-25_00-04-27");

  if (!fs.existsSync(mediaDir)) {
    throw new Error(`Media directory does not exist: ${mediaDir}`);
  }

  const files = fs.readdirSync(mediaDir);

  // Find first .jpg or .jpeg (case-insensitive)
  const jpeg = files.find((f) => /\.(jpe?g)$/i.test(f));

  if (!jpeg) {
    throw new Error(`No JPEG files found in media directory: ${mediaDir}`);
  }

  const fullPath = path.join(mediaDir, jpeg);
  return fullPath;
}

// ---- formatting helpers ----

function formatMDYTimeAMPM(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  let hour12 = hours % 12;
  if (hour12 === 0) hour12 = 12;

  const mm = minutes.toString().padStart(2, "0");
  return `${month}/${day}/${year} ${hour12}:${mm} ${ampm}`;
}

function formatObservedSummary(date: Date): string {
  const dateStr = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `Observed on ${dateStr} at approximately ${timeStr}.\n`;
}

// ---- DOM helpers executed inside the page ----

async function setObservedDateTimeOnPage(page: Page, observed: Date) {
  const hiddenValueBase = observed.toISOString().replace(/\.\d+Z$/, "");
  const hiddenValue = hiddenValueBase + ".0000000Z";
  const displayValue = formatMDYTimeAMPM(observed);

  await page.evaluate(
    ({ hiddenValue, displayValue }) => {
      const hidden = document.getElementById(
        "n311_datetimeobserved"
      ) as HTMLInputElement | null;
      const visible = document.getElementById(
        "n311_datetimeobserved_datepicker_description"
      ) as HTMLInputElement | null;

      if (!hidden || !visible) {
        console.error("Observed datetime inputs not found");
        return;
      }

      // Visible field (user-facing)
      visible.value = displayValue;
      visible.classList.add("dirty");
      visible.dispatchEvent(new Event("input", { bubbles: true }));
      visible.dispatchEvent(new Event("change", { bubbles: true }));

      // Hidden field (submit value)
      hidden.value = hiddenValue;
      hidden.dispatchEvent(new Event("input", { bubbles: true }));
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { hiddenValue, displayValue }
  );
}

async function setRadioByLabelInPage(
  page: Page,
  groupSelector: string,
  labelText: string
) {
  await page.evaluate(
    ({ groupSelector, labelText }) => {
      const els = document.querySelectorAll<HTMLInputElement>(groupSelector);
      const normalized = labelText.toLowerCase();
      els.forEach((el) => {
        const label =
          el.getAttribute("aria-label") ||
          el.textContent ||
          (el.nextElementSibling && el.nextElementSibling.textContent) ||
          "";
        if (label.toLowerCase().includes(normalized)) {
          el.click();
        }
      });
    },
    { groupSelector, labelText }
  );
}

async function uploadAttachmentAndGetTimestamp(page: Page): Promise<Date> {

  await page.click("#attachments-addbutton");
  const fileInput = page.locator(
    'input[type="file"][name="file"][aria-label="Choose File"]'
  );
  await expect(fileInput).toBeVisible({ timeout: 15000 });
  await fileInput.setInputFiles(PHOTO_PATH);
  const modal = page.locator('.modal-content', {
    hasText: 'Add Attachment',
  });
  const modalAddButton = modal
    .locator('.modal-footer')
    .getByRole('button', { name: /^Add Attachment$/i });

  await modalAddButton.click();

  const timeLocator = page.locator(
    'td[data-th="Date Uploaded"] time[datetime]'
  );
  await expect(timeLocator).toBeVisible({ timeout: 60000 });

  // Return the actual file creation time, not the upload time
  const stats = fs.statSync(PHOTO_PATH);
  return stats.birthtime;
}

async function fillFirstPageFromUpload(page: Page, observed: Date) {
  // 1) Set Date/Time Observed (hidden + visible)
  await setObservedDateTimeOnPage(page, observed);

  // 2) Recurring problem? select "Yes"
  await setRadioByLabelInPage(
    page,
    'input[type="radio"][name*="recurring"], input[type="radio"][aria-label*="Recurring"]',
    "Yes"
  );

  // 3) "Describe the days and times the problem happens"
  await page.fill(
    'textarea[id*="describethedaysandtimestheproblemhappens"]',
    "all day, every day, but especially weekday mornings"
  );

  // 4) Problem description, using the observed date/time
  const observedText = formatObservedSummary(observed);
  const problemText =
    observedText + "Truck observed using a non-truck route.\n";

  const problemLocator = page.locator(
    'textarea[aria-label="Describe the Problem"], textarea[aria-label*="Describe the Problem"], textarea[name*="description"]'
  );
  await problemLocator.first().fill(problemText);

  // Scroll to heading for a bit of visual confirmation when you're watching it
  const heading = page.locator("h1, h2, [role='heading']").first();
  if (await heading.count()) {
    await heading.scrollIntoViewIfNeeded();
  }
}


function formatObservedText(observedDate: Date | null): string {
  if (!observedDate) return "";
  const d = observedDate;
  const date = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `Observed on ${date} at approximately ${time}.\n`;
}

// ---- DOM helpers (run inside the page via page.evaluate) ----

async function setObservedDateTime(
  page: Page,
  hiddenValue: string,
  displayValue: string
) {
  await page.evaluate(
    ({ hiddenValue, displayValue }) => {
      const hidden = document.getElementById(
        "n311_datetimeobserved"
      ) as HTMLInputElement | null;
      const visible = document.getElementById(
        "n311_datetimeobserved_datepicker_description"
      ) as HTMLInputElement | null;

      if (!hidden || !visible) {
        console.error("Observed datetime inputs not found");
        return;
      }

      // Set visible field (what the user would type)
      visible.value = displayValue;
      visible.classList.add("dirty"); // mimic what the UI does
      visible.dispatchEvent(new Event("input", { bubbles: true }));
      visible.dispatchEvent(new Event("change", { bubbles: true }));

      // Set hidden field (what gets submitted)
      hidden.value = hiddenValue;
      hidden.dispatchEvent(new Event("input", { bubbles: true }));
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { hiddenValue, displayValue }
  );
}

async function setRadioByLabel(
  page: Page,
  groupSelector: string,
  labelText: string
) {
  await page.evaluate(
    ({ groupSelector, labelText }) => {
      if (!labelText) return;
      const els = document.querySelectorAll<HTMLInputElement>(groupSelector);
      const normalized = labelText.toLowerCase();
      els.forEach((el) => {
        const label =
          el.getAttribute("aria-label") ||
          el.textContent ||
          (el.nextElementSibling && el.nextElementSibling.textContent) ||
          "";
        if (label.toLowerCase().includes(normalized)) {
          el.click();
        }
      });
    },
    { groupSelector, labelText }
  );
}

async function setValue(page: Page, selector: string, value: string) {
  await page.evaluate(
    ({ selector, value }) => {
      if (!value) return;
      const el = document.querySelector(
        selector
      ) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return;
      (el as any).value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { selector, value }
  );
}

// ---- Page 2: location + address ----

async function fillSecondPage(page: Page) {
  const ADDRESS_INPUT = "20 CLINTON STREET, NEW YORK";

  // Helper: type a string one char at a time w/ random delay
  async function typeSlowly(selector: string, text: string) {
    await page.click(selector);
    for (const ch of text) {
      await page.type(selector, ch, {
        delay: 10 + Math.random() * 90, // between 10–100ms
      });
    }
  }

  // 1) Location type — choose "Street/Sidewalk"
  await page.selectOption("#n311_locationtypeid_select", {
    label: "Street/Sidewalk",
  });

  // 2) Open the address-picker modal
  await page.click("#SelectAddressWhere");

  // Wait for the modal search box
  await page.waitForSelector("#address-search-box-input", {
    state: "visible",
    timeout: 15000,
  });

  // 3) Type the address one character at a time
  await typeSlowly("#address-search-box-input", ADDRESS_INPUT);

  // 4) Wait for typeahead suggestions
  const suggestionItems = page.locator(
    "#suggestion-list-0 .ui-menu-item-wrapper"
  );

  await expect(suggestionItems.first()).toBeVisible({ timeout: 15000 });

  // 5) Try to select exact match
  const escaped = ADDRESS_INPUT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactMatch = suggestionItems.filter({
    hasText: new RegExp(`^${escaped}$`, "i"),
  });

  if (await exactMatch.count()) {
    await exactMatch.first().click();
  } else {
    // fallback: take the first suggestion
    await suggestionItems.first().click();
  }

  // 6) Confirm with "Select Address"
  await page.click("#SelectAddressMap");

  // DONE — caller will handle clicking Next with Playwright navigation waiting
}

// ---- Page 3: contact info ----

async function fillThirdPage(page: Page) {
  const CONTACT_FIRST_NAME = "Michael";
  const CONTACT_LAST_NAME = "Hassin";
  const CONTACT_EMAIL = "hassinmichael@gmail.com";
  const CONTACT_PRIMARY_PHONE = "8622161173";

  const ADDRESS_LINE_1 = "20 Clinton Street";
  const ADDRESS_LINE_2 = "Apt 2A";
  const ADDRESS_CITY = "New York";
  const ADDRESS_STATE = "NY";
  const ADDRESS_BOROUGH_VALUE = "1"; // Manhattan
  const ADDRESS_ZIP = "10002";

  const CUSTOMER_ROLE_VALUE = "614110006"; // "Self"

  await page.evaluate(
    ({
      CONTACT_FIRST_NAME,
      CONTACT_LAST_NAME,
      CONTACT_EMAIL,
      CONTACT_PRIMARY_PHONE,
      ADDRESS_LINE_1,
      ADDRESS_LINE_2,
      ADDRESS_CITY,
      ADDRESS_STATE,
      ADDRESS_BOROUGH_VALUE,
      ADDRESS_ZIP,
      CUSTOMER_ROLE_VALUE,
    }) => {
      function setValueById(id: string, value: string) {
        const el = document.getElementById(id) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        if (!el) {
          console.warn("Truck helper: element not found:", id);
          return;
        }
        (el as any).value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }

      // "My Information" section
      setValueById("n311_contactfirstname", CONTACT_FIRST_NAME);
      setValueById("n311_contactlastname", CONTACT_LAST_NAME);
      setValueById("n311_contactemail", CONTACT_EMAIL);
      setValueById("n311_contactphone", CONTACT_PRIMARY_PHONE);

      // "My Address" section
      setValueById("n311_portalcustomeraddressline1", ADDRESS_LINE_1);
      setValueById("n311_portalcustomeraddressline2", ADDRESS_LINE_2);
      setValueById("n311_portalcustomeraddresscity", ADDRESS_CITY);

      const stateSelect = document.getElementById(
        "custom_n311_portalcustomeraddressstate"
      ) as HTMLSelectElement | null;
      if (stateSelect) {
        stateSelect.value = ADDRESS_STATE;
        stateSelect.dispatchEvent(new Event("input", { bubbles: true }));
        stateSelect.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        console.warn(
          "Truck helper: custom_n311_portalcustomeraddressstate not found"
        );
      }

      // Hidden state text input
      setValueById("n311_portalcustomeraddressstate", ADDRESS_STATE);

      // Borough
      const boroughSelect = document.getElementById(
        "n311_portalcustomeraddressborough"
      ) as HTMLSelectElement | null;
      if (boroughSelect) {
        boroughSelect.value = ADDRESS_BOROUGH_VALUE;
        boroughSelect.dispatchEvent(
          new Event("input", { bubbles: true })
        );
        boroughSelect.dispatchEvent(
          new Event("change", { bubbles: true })
        );
      } else {
        console.warn(
          "Truck helper: n311_portalcustomeraddressborough not found"
        );
      }

      setValueById("n311_portalcustomeraddresszip", ADDRESS_ZIP);

      const customerRoleSelect = document.getElementById(
        "n311_customerrole"
      ) as HTMLSelectElement | null;
      if (customerRoleSelect) {
        customerRoleSelect.value = CUSTOMER_ROLE_VALUE;
        customerRoleSelect.dispatchEvent(
          new Event("input", { bubbles: true })
        );
        customerRoleSelect.dispatchEvent(
          new Event("change", { bubbles: true })
        );
      } else {
        console.warn("Truck helper: n311_customerrole not found");
      }
    },
    {
      CONTACT_FIRST_NAME,
      CONTACT_LAST_NAME,
      CONTACT_EMAIL,
      CONTACT_PRIMARY_PHONE,
      ADDRESS_LINE_1,
      ADDRESS_LINE_2,
      ADDRESS_CITY,
      ADDRESS_STATE,
      ADDRESS_BOROUGH_VALUE,
      ADDRESS_ZIP,
      CUSTOMER_ROLE_VALUE,
    }
  );
}

async function bringRecaptchaIntoView(page: Page) {
  // Wait for reCAPTCHA iframe to exist
  const recaptchaFrame = page.locator('iframe[title="reCAPTCHA"]');
  await recaptchaFrame.waitFor({ timeout: 60000 });

  // Scroll to roughly where it is
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(80 + Math.random() * 60);
  }

  // Scroll the iframe precisely into view
  await recaptchaFrame.scrollIntoViewIfNeeded();

  // Get its bounding box and move mouse nearby
  const box = await recaptchaFrame.boundingBox();
  if (box) {
    const targetX = box.x + box.width / 2;
    const targetY = box.y + box.height / 2;

    // Move in a couple of small steps to feel more "human"
    await page.mouse.move(targetX - 50, targetY - 30, { steps: 10 });
    await page.waitForTimeout(100 + Math.random() * 150);
    await page.mouse.move(targetX, targetY, { steps: 15 });
  }
}


// ---- The main Playwright test ----

test("submit NYC 311 truck route complaint up to captcha", async ({ page }) => {
  // 0) Start at the article URL
  await page.goto(ARTICLE_URL, { waitUntil: "domcontentloaded" });

  await page.waitForTimeout(5000);

  // 1) Click the "report a truck on a roadway where truck traffic is not allowed" link
  const link = page.locator('a.contentaction', {
    hasText: /report a truck on a roadway where truck traffic is not allowed/i,
  });

  // Click and then wait for some element that only exists on the SR page
  await link.click();

  await page.waitForSelector(
    "#n311_datetimeobserved_datepicker_description",
    { timeout: 60000 }
  );

  const observedFromUpload = await uploadAttachmentAndGetTimestamp(page);

  // Use that server-side timestamp to populate Date/Time Observed + text
  await fillFirstPageFromUpload(page, observedFromUpload);

  // await page.waitForTimeout(1500);

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.locator("#NextButton").click(),
  ]);

  // 7) Fill page 2 (location + address) then click Next with Playwright
  await fillSecondPage(page);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.locator("#NextButton").click(),
  ]);

  // 8) Fill page 3 (your contact info) then click Next with Playwright
  await fillThirdPage(page);

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.locator("#NextButton").click(),
  ]);

  await page.pause();

  // // Now you should be on the final page with reCAPTCHA.
  // await page.waitForTimeout(6000000);
});


/*

ok we're now failing to put location information in on the second page. let's change strategies and just use the ui components to mimic manual entry of the address.

location type dropdown:
```
<select id="n311_locationtypeid_select" class="form-control exclude-from-summary"><option value="" label=""></option><option value="a00a28b5-e84e-e811-a94f-000d3a36098b" disableaddress="false" disableblock="true" disableintersection="true" disablelandmark="true" disablebridgehighway="false" hpdanonymous="false">Highway</option><option value="a20a28b5-e84e-e811-a94f-000d3a36098b" disableaddress="false" disableblock="false" disableintersection="false" disablelandmark="false" disablebridgehighway="true" hpdanonymous="false">Street/Sidewalk</option><option value="a40a28b5-e84e-e811-a94f-000d3a36098b" disableaddress="false" disableblock="true" disableintersection="true" disablelandmark="true" disablebridgehighway="false" hpdanonymous="false">Roadway Tunnel</option></select>
```

we want to select the "street/sidewalk" option here.

button that fires open the address selection modal:
```
<button type="button" class="address-picker-btn btn btn-default" id="SelectAddressWhere" name="Select-Address-Where-Section"><span><i class="fa fa-search"></i></span></button>
```

once the modal opens, this is the textbox where you type the address in:
```
<input id="address-search-box-input" type="text" class="text form-control exclude-from-summary ui-autocomplete-input" placeholder="Search for an NYC Address, Block, Intersection or Landmark" autocomplete="off">
```

once you type the address in, autocomplete suggestions are filled into here:
```
<div id="suggestion-list-0"><ul id="ui-id-1" tabindex="0" class="ui-menu ui-widget ui-widget-content ui-autocomplete ui-front" style="top: 45px; left: 30px; width: 967px; display: none;"><li class="ui-autocomplete-category">Address</li><li aria-label="Address : 20 CLINTON STREET, NEW YORK" class="ui-menu-item"><div id="ui-id-20" tabindex="-1" class="ui-menu-item-wrapper">20 CLINTON STREET, NEW YORK</div></li><li aria-label="Address : 20 CLINTON STREET, BROOKLYN" class="ui-menu-item"><div id="ui-id-21" tabindex="-1" class="ui-menu-item-wrapper">20 CLINTON STREET, BROOKLYN</div></li><li aria-label="Address : 20 CLINTON STREET, STATEN ISLAND" class="ui-menu-item"><div id="ui-id-22" tabindex="-1" class="ui-menu-item-wrapper">20 CLINTON STREET, STATEN ISLAND</div></li></ul></div>
```

we want to select the first option that case-insensitively exactly matches our input

once that's selected, we want to click this "select address" button

```
<input type="button" value="Select Address" class="btn btn-primary" id="SelectAddressMap" name="Select-Address-Map-Container">
```
captcha:
<div class="rc-anchor-center-item rc-anchor-checkbox-holder"><span class="recaptcha-checkbox goog-inline-block recaptcha-checkbox-unchecked rc-anchor-checkbox" role="checkbox" aria-checked="false" id="recaptcha-anchor" tabindex="0" dir="ltr" aria-labelledby="recaptcha-anchor-label"><div class="recaptcha-checkbox-border" role="presentation"></div><div class="recaptcha-checkbox-borderAnimation" role="presentation"></div><div class="recaptcha-checkbox-spinner" role="presentation"><div class="recaptcha-checkbox-spinner-overlay"></div></div><div class="recaptcha-checkbox-checkmark" role="presentation"></div></span></div>

*/
