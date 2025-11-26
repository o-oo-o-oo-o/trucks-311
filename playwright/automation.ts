import { expect } from '@playwright/test';
// import { Page } from 'patchright'; // Types conflict with @playwright/test expect
import path from 'path';
import fs from 'fs';

// We now start at the article URL
const ARTICLE_URL = "https://portal.311.nyc.gov/article/?kanumber=KA-01957";

// ---- Human-like helpers ----

async function randomDelay(page: any, min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await page.waitForTimeout(delay);
}

async function humanMove(page: any) {
    // Move mouse to a random position to simulate human jitter
    const x = Math.floor(Math.random() * 500);
    const y = Math.floor(Math.random() * 500);
    await page.mouse.move(x, y, { steps: 10 });
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

async function setObservedDateTimeOnPage(page: any, observed: Date) {
    const hiddenValueBase = observed.toISOString().replace(/\.\d+Z$/, "");
    const hiddenValue = hiddenValueBase + ".0000000Z";
    const displayValue = formatMDYTimeAMPM(observed);

    await page.evaluate(
        ({ hiddenValue, displayValue }: { hiddenValue: string; displayValue: string }) => {
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
    page: any,
    groupSelector: string,
    labelText: string
) {
    await page.evaluate(
        ({ groupSelector, labelText }: { groupSelector: string; labelText: string }) => {
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

async function uploadAttachmentAndGetTimestamp(page: any, photoPath: string): Promise<Date> {

    await page.click("#attachments-addbutton");
    const fileInput = page.locator(
        'input[type="file"][name="file"][aria-label="Choose File"]'
    );
    await expect(fileInput).toBeVisible({ timeout: 15000 });
    await fileInput.setInputFiles(photoPath);
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
    const stats = fs.statSync(photoPath);
    return stats.birthtime;
}

async function fillFirstPageFromUpload(page: any, observed: Date) {
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

// ---- Page 2: location + address ----

async function fillSecondPage(page: any) {
    const ADDRESS_INPUT = "20 CLINTON STREET, NEW YORK";

    // Helper: type a string one char at a time w/ random delay
    async function typeSlowly(selector: string, text: string, retries = 3) {
        await page.click(selector);
        // Ensure we start clean if we are retrying or if field has junk
        await page.fill(selector, "");

        for (const ch of text) {
            await page.type(selector, ch, {
                delay: 10 + Math.random() * 90, // between 10–100ms
            });
        }

        const val = await page.inputValue(selector);
        if (val !== text) {
            if (retries > 0) {
                console.warn(`Mismatch in typeSlowly: expected "${text}", got "${val}". Retrying...`);
                await typeSlowly(selector, text, retries - 1);
            } else {
                throw new Error(`Failed to type text correctly after multiple attempts. Expected "${text}", got "${val}"`);
            }
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
        hasText: new RegExp(`^ ${escaped}$`, "i"),
    });

    if (await exactMatch.count()) {
        await exactMatch.first().click();
    } else {
        // fallback: take the first suggestion
        await suggestionItems.first().click();
    }

    // 6) Confirm with "Select Address"
    await page.click("#SelectAddressMap");
}

// ---- Page 3: contact info ----

async function fillThirdPage(page: any) {
    const CONTACT_FIRST_NAME = "Michael";
    const CONTACT_LAST_NAME = "Hassin";
    const CONTACT_EMAIL = "hassinmichael@gmail.com";
    const CONTACT_PRIMARY_PHONE = "";

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
        }: {
            CONTACT_FIRST_NAME: string;
            CONTACT_LAST_NAME: string;
            CONTACT_EMAIL: string;
            CONTACT_PRIMARY_PHONE: string;
            ADDRESS_LINE_1: string;
            ADDRESS_LINE_2: string;
            ADDRESS_CITY: string;
            ADDRESS_STATE: string;
            ADDRESS_BOROUGH_VALUE: string;
            ADDRESS_ZIP: string;
            CUSTOMER_ROLE_VALUE: string;
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

export async function runComplaint(page: any, imagePath: string) {
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

    const observedFromUpload = await uploadAttachmentAndGetTimestamp(page, imagePath);

    // Use that server-side timestamp to populate Date/Time Observed + text
    await fillFirstPageFromUpload(page, observedFromUpload);

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

    // Pause for manual captcha
    console.log("Pausing for manual captcha...");
    await page.pause();
}
